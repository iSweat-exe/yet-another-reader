//! Background thread that keeps a [`LazerSession`] alive and publishes its state.
//!
//! The session holds non-`Send` CLR handles, so it is created and used on this thread only.

use std::sync::Arc;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use lazer_reader::input::InputState;
use lazer_reader::model::{GameState, ReaderStatus};
use lazer_reader::session::LazerSession;
use lazer_reader::{ReaderError, Result};
use overlay_server::Hub;
use tauri::{AppHandle, Emitter};

use crate::diag::{Diag, ReaderDiag};
use crate::platform::{fine_timer, lower_priority};
use crate::records::Records;

const RETRY_INTERVAL: Duration = Duration::from_secs(2);
/// A failed snapshot is usually transient (the game's GC moved an object mid-read). Only after
/// this many failures in a row is the session dropped; reconnecting rescans the game's whole
/// memory, which is far more disruptive than skipping a few frames.
const MAX_CONSECUTIVE_FAILURES: u32 = 90;
/// Outside a play, with nobody subscribed to the state over the API, the game is sampled no faster
/// than this: menus have nothing that moves faster, and the reader should cost the game nothing there.
const IDLE_POLL_FLOOR_MS: u64 = 100;
/// Likewise the keys are sampled no faster than this outside a play (the keyboard widget in a menu).
const IDLE_INPUT_FLOOR_MS: u64 = 8;
/// The webview windows do not need a refresh faster than this unless a play is running.
const IDLE_UI_INTERVAL: Duration = Duration::from_millis(100);

pub const EVENT_GAME_STATE: &str = "game-state";
pub const EVENT_READER_STATUS: &str = "reader-status";
pub const EVENT_INPUT_STATE: &str = "input-state";

/// Everything the reader thread needs; cheap to clone into the thread.
#[derive(Clone)]
pub struct ReaderContext {
    pub app: AppHandle,
    pub hub: Hub,
    /// Polling interval in milliseconds, adjustable while the thread runs.
    pub poll_ms: Arc<AtomicU64>,
    /// Sampling interval of the held keys and mouse buttons, in milliseconds.
    pub input_ms: Arc<AtomicU64>,
    /// Refresh rate of the overlay window, in updates per second.
    pub overlay_fps: Arc<AtomicU32>,
    /// Counters and journal shown on the Status page.
    pub diag: Diag,
    /// Where the personal bests are kept.
    pub records_dir: std::path::PathBuf,
}

pub fn spawn(ctx: ReaderContext) -> std::io::Result<()> {
    thread::Builder::new()
        .name("lazer-reader".into())
        .spawn(move || {
            lower_priority();
            run(&ctx);
        })
        .map(drop)
}

fn run(ctx: &ReaderContext) {
    let mut meter = Meter::new();
    loop {
        publish_status(ctx, ReaderStatus::Waiting);
        match connect(ctx) {
            Ok(mut session) => {
                meter.begin_session();
                let reason = poll(ctx, &mut session, &mut meter);
                ctx.diag
                    .warn(&ctx.app, "reader", format!("reading stopped: {reason}"));
                publish_game(ctx, GameState::default());
                publish_status(ctx, status_for(&reason));
            }
            Err(e) => publish_status(ctx, status_for(&e)),
        }
        thread::sleep(RETRY_INTERVAL);
    }
}

fn connect(ctx: &ReaderContext) -> Result<LazerSession> {
    // Cheap probe first so "Waiting" does not flicker into "Connecting" every retry.
    lazer_reader::process::Process::attach()?;
    publish_status(ctx, ReaderStatus::Connecting);
    let started = Instant::now();
    let session = LazerSession::connect()?;
    publish_status(
        ctx,
        ReaderStatus::Connected {
            version: session.version().to_string(),
            stream: session.version().stream().to_owned(),
            profile: session.profile().source.to_owned(),
            connect_ms: started.elapsed().as_millis() as u64,
            gc_mode: session.gc_mode(),
        },
    );
    Ok(session)
}

/// How often the garbage collector's mode is looked at (it changes once per game session at most).
const GC_INTERVAL: Duration = Duration::from_secs(2);

/// Puts the game's current GC mode in the published status, which carries it since connecting.
fn refresh_gc_mode(ctx: &ReaderContext, session: &LazerSession) {
    let ReaderStatus::Connected {
        version,
        stream,
        profile,
        connect_ms,
        gc_mode,
    } = ctx.hub.status()
    else {
        return;
    };
    let now = session.gc_mode();
    if now == gc_mode {
        return;
    }
    ctx.diag
        .info(&ctx.app, "reader", format!("GC latency mode: {now:?}"));
    let status = ReaderStatus::Connected {
        version,
        stream,
        profile,
        connect_ms,
        gc_mode: now,
    };
    let _ = ctx.app.emit(EVENT_READER_STATUS, &status);
    ctx.hub.publish_status(status);
}

/// Polls until the game goes away or becomes unreadable; returns why.
///
/// Two rhythms share this loop. The game state is sampled every `poll_ms`. The held keys and mouse
/// buttons are sampled every `input_ms` (a few milliseconds), but only while something listens to
/// them: they are meant to be real time, and reading them is useless otherwise.
fn poll(ctx: &ReaderContext, session: &mut LazerSession, meter: &mut Meter) -> ReaderError {
    let mut last: Option<GameState> = None;
    let mut ui = UiEmitter::default();
    let mut failures = 0u32;
    let mut next_snapshot = Instant::now();
    let mut inputs = InputLoop::default();
    let mut records = Records::new(ctx.records_dir.clone(), ctx.hub.clone());
    let mut in_play = false;
    let mut next_gc = Instant::now() + GC_INTERVAL;
    let result = loop {
        if Instant::now() >= next_snapshot {
            let started = Instant::now();
            let snapshot = session.snapshot();
            meter.snapshot(started.elapsed(), snapshot.is_ok());
            match snapshot {
                Ok(mut state) => {
                    records.observe(last.as_ref(), &mut state);
                    if failures > 0 {
                        ctx.diag.info(
                            &ctx.app,
                            "reader",
                            format!("read recovered after {failures} failed attempt(s)"),
                        );
                    }
                    failures = 0;
                    in_play = state.gameplay.is_some();
                    if last.as_ref() != Some(&state) {
                        for change in describe_changes(last.as_ref(), &state) {
                            ctx.diag.info(&ctx.app, "game", change);
                        }
                        ctx.hub.publish_state(state.clone());
                        ui.emit(&ctx.app, &state, ctx.overlay_fps.load(Ordering::Relaxed));
                        last = Some(state);
                    }
                }
                Err(e) => {
                    failures += 1;
                    meter.last_error = Some(e.to_string());
                    // One line for the first failure, then one every 30, never a flood.
                    if failures == 1 || failures.is_multiple_of(30) {
                        ctx.diag.warn(
                            &ctx.app,
                            "reader",
                            format!("snapshot failed ({failures} in a row): {e}"),
                        );
                    }
                    if failures >= MAX_CONSECUTIVE_FAILURES || !session.is_alive() {
                        break e;
                    }
                }
            }
            next_snapshot = Instant::now() + snapshot_interval(ctx, in_play);
        }

        ui.flush(&ctx.app, ctx.overlay_fps.load(Ordering::Relaxed));

        if Instant::now() >= next_gc {
            next_gc = Instant::now() + GC_INTERVAL;
            refresh_gc_mode(ctx, session);
        }

        let wanted = inputs.step(ctx, session, meter);
        meter.tick(ctx, wanted);

        let until_snapshot = next_snapshot.saturating_duration_since(Instant::now());
        let nap = if wanted {
            until_snapshot.min(input_interval(ctx, in_play))
        } else {
            until_snapshot
        };
        thread::sleep(nap);
    };
    inputs.stop(ctx);
    result
}

/// The fine-grained reading of held keys and mouse buttons, which runs only while something listens to it.
#[derive(Default)]
struct InputLoop {
    reading: bool,
    /// The last read failed (logged once, not on every tick).
    failing: bool,
}

impl InputLoop {
    /// One tick: reads and publishes the inputs if anyone wants them, and stops reading when nobody does.
    /// Returns whether they are wanted (the loop then sleeps for less).
    fn step(&mut self, ctx: &ReaderContext, session: &mut LazerSession, meter: &mut Meter) -> bool {
        let wanted = ctx.hub.inputs_wanted();
        if wanted {
            if !self.reading {
                fine_timer(true);
                ctx.diag.info(
                    &ctx.app,
                    "inputs",
                    format!("reading keys started ({})", consumers_text(&ctx.hub)),
                );
            }
            let started = Instant::now();
            match session.read_inputs() {
                Ok(inputs) => {
                    meter.input_read(started.elapsed());
                    if self.failing {
                        ctx.diag.info(&ctx.app, "inputs", "key reads work again");
                        self.failing = false;
                    }
                    publish_inputs(ctx, &inputs);
                }
                Err(e) if !self.failing => {
                    self.failing = true;
                    ctx.diag
                        .warn(&ctx.app, "inputs", format!("cannot read the keys: {e}"));
                }
                Err(_) => {}
            }
        } else if self.reading {
            self.stop(ctx);
            ctx.diag.info(
                &ctx.app,
                "inputs",
                "reading keys stopped (nobody looks at them)",
            );
        }
        self.reading = wanted;
        wanted
    }

    /// Stops reading: the fine timer goes back and the published keys are cleared.
    fn stop(&mut self, ctx: &ReaderContext) {
        if self.reading {
            fine_timer(false);
        }
        self.reading = false;
        publish_inputs(ctx, &InputState::default());
    }
}

/// Time between two snapshots: the configured one, stretched in a menu when no API client watches.
fn snapshot_interval(ctx: &ReaderContext, in_play: bool) -> Duration {
    let ms = ctx.poll_ms.load(Ordering::Relaxed).max(1);
    let relaxed = !in_play && ctx.hub.state_clients() == 0;
    Duration::from_millis(if relaxed {
        ms.max(IDLE_POLL_FLOOR_MS)
    } else {
        ms
    })
}

/// Time between two key reads: the configured one, stretched outside a play.
fn input_interval(ctx: &ReaderContext, in_play: bool) -> Duration {
    let ms = ctx.input_ms.load(Ordering::Relaxed).max(1);
    Duration::from_millis(if in_play {
        ms
    } else {
        ms.max(IDLE_INPUT_FLOOR_MS)
    })
}

/// Who asked for the keys, as a short phrase (`overlay window, 1 WebSocket`).
fn consumers_text(hub: &Hub) -> String {
    let c = hub.input_consumers();
    let mut who: Vec<String> = c.windows.iter().map(|w| format!("{w} window")).collect();
    if c.sockets > 0 {
        who.push(format!("{} WebSocket", c.sockets));
    }
    if c.rest {
        who.push("REST client".into());
    }
    who.join(", ")
}

/// What changed between two states, as journal lines (screen, ruleset, mods, map, play).
fn describe_changes(prev: Option<&GameState>, now: &GameState) -> Vec<String> {
    let mut out = Vec::new();
    let short = |t: &str| t.rsplit('.').next().unwrap_or(t).to_owned();
    if prev.is_none_or(|p| p.screen_type != now.screen_type) {
        out.push(format!("screen: {}", short(&now.screen_type)));
    }
    if prev.is_none_or(|p| p.ruleset != now.ruleset) {
        out.push(format!(
            "ruleset: {}",
            now.ruleset.as_deref().unwrap_or("none")
        ));
    }
    if prev.is_none_or(|p| p.mods != now.mods || p.clock_rate != now.clock_rate) {
        let mods = if now.mods.is_empty() {
            "no mods".to_owned()
        } else {
            now.mods.join(" ")
        };
        out.push(format!("mods: {mods} (speed {}x)", now.clock_rate));
    }
    let map = |s: &GameState| s.beatmap.as_ref().map(|b| b.sha256.clone());
    if prev.is_none_or(|p| map(p) != map(now)) {
        match &now.beatmap {
            Some(b) => out.push(format!(
                "beatmap: {} - {} [{}]",
                b.artist, b.title, b.version
            )),
            None => out.push("beatmap: none".into()),
        }
    }
    let stars = |s: &GameState| {
        s.difficulty
            .as_ref()
            .map(|d| (d.stars * 100.0).round() as i64)
    };
    if let Some(d) = &now.difficulty
        && prev.is_none_or(|p| stars(p) != stars(now))
    {
        out.push(format!(
            "difficulty with mods: {:.2} stars, {:.0} pp for 100%",
            d.stars, d.pp100
        ));
    }
    match (
        prev.is_some_and(|p| p.gameplay.is_some()),
        now.gameplay.is_some(),
    ) {
        (false, true) => out.push("play started".into()),
        (true, false) => out.push("play ended".into()),
        _ => {}
    }
    out
}

/// Counters of the reader loop, rolled up once a second into a [`ReaderDiag`].
struct Meter {
    window: Instant,
    snapshots: u32,
    snapshot_total: Duration,
    snapshot_max: Duration,
    input_reads: u32,
    input_total: Duration,
    ok: u64,
    failed: u64,
    sessions: u32,
    session_start: Instant,
    last_error: Option<String>,
}

impl Meter {
    fn new() -> Self {
        Self {
            window: Instant::now(),
            snapshots: 0,
            snapshot_total: Duration::ZERO,
            snapshot_max: Duration::ZERO,
            input_reads: 0,
            input_total: Duration::ZERO,
            ok: 0,
            failed: 0,
            sessions: 0,
            session_start: Instant::now(),
            last_error: None,
        }
    }

    fn begin_session(&mut self) {
        self.sessions += 1;
        self.session_start = Instant::now();
    }

    fn snapshot(&mut self, took: Duration, ok: bool) {
        self.snapshots += 1;
        self.snapshot_total += took;
        self.snapshot_max = self.snapshot_max.max(took);
        if ok {
            self.ok += 1;
        } else {
            self.failed += 1;
        }
    }

    fn input_read(&mut self, took: Duration) {
        self.input_reads += 1;
        self.input_total += took;
    }

    /// Once a second: publishes the counters of the window that just ended and starts a new one.
    fn tick(&mut self, ctx: &ReaderContext, inputs_reading: bool) {
        let secs = self.window.elapsed().as_secs_f64();
        if secs < 1.0 {
            return;
        }
        let per_sec = |n: u32| f64::from(n) / secs;
        let mean = |total: Duration, n: u32| {
            if n == 0 {
                0.0
            } else {
                total.as_secs_f64() / f64::from(n)
            }
        };
        ctx.diag.set_metrics(
            &ctx.app,
            ReaderDiag {
                snapshots_per_sec: per_sec(self.snapshots),
                target_snapshots_per_sec: 1000.0
                    / ctx.poll_ms.load(Ordering::Relaxed).max(1) as f64,
                snapshot_ms: mean(self.snapshot_total, self.snapshots) * 1000.0,
                snapshot_max_ms: self.snapshot_max.as_secs_f64() * 1000.0,
                snapshots_ok: self.ok,
                snapshots_failed: self.failed,
                inputs_reading,
                input_reads_per_sec: per_sec(self.input_reads),
                input_read_us: mean(self.input_total, self.input_reads) * 1_000_000.0,
                input_consumers: ctx.hub.input_consumers(),
                state_clients: ctx.hub.state_clients(),
                sessions: self.sessions,
                session_ms: self.session_start.elapsed().as_millis() as u64,
                last_error: self.last_error.clone(),
            },
        );
        self.window = Instant::now();
        self.snapshots = 0;
        self.snapshot_total = Duration::ZERO;
        self.snapshot_max = Duration::ZERO;
        self.input_reads = 0;
        self.input_total = Duration::ZERO;
    }
}

/// Publishes the held inputs to the API and to the windows that asked for them (on change only).
fn publish_inputs(ctx: &ReaderContext, inputs: &InputState) {
    if ctx.hub.publish_inputs(inputs) {
        for label in ctx.hub.input_windows() {
            let _ = ctx.app.emit_to(label.as_str(), EVENT_INPUT_STATE, inputs);
        }
    }
}

/// A window's `game-state` feed: at most one event per interval, never losing the latest state.
#[derive(Default)]
struct Throttled {
    sent: Option<Instant>,
    pending: Option<GameState>,
}

impl Throttled {
    /// Sends `state` now if `immediate` or the interval has passed, otherwise holds it back.
    fn offer(
        &mut self,
        app: &AppHandle,
        label: &str,
        state: &GameState,
        interval: Duration,
        immediate: bool,
    ) {
        if immediate || self.sent.is_none_or(|t| t.elapsed() >= interval) {
            let _ = app.emit_to(label, EVENT_GAME_STATE, state);
            self.sent = Some(Instant::now());
            self.pending = None;
        } else {
            self.pending = Some(state.clone());
        }
    }

    /// Sends a state that was held back, once its delay has passed.
    fn flush(&mut self, app: &AppHandle, label: &str, interval: Duration) {
        if self.sent.is_some_and(|t| t.elapsed() >= interval)
            && let Some(state) = self.pending.take()
        {
            let _ = app.emit_to(label, EVENT_GAME_STATE, &state);
            self.sent = Some(Instant::now());
        }
    }
}

/// Decides when the webview windows get a `game-state` event.
///
/// The API (WebSocket) always sees every change. The windows are cheaper to feed sparingly:
/// the overlay is capped at its configured refresh rate (the game must not pay for repaints
/// nobody can tell apart), outside a play only meaningful changes reach it (the song clock
/// ticks constantly but no visible widget uses it), and the dashboard needs ~10 updates/s.
#[derive(Default)]
struct UiEmitter {
    /// Last state seen, with the clock removed (to detect meaningful changes).
    key: Option<GameState>,
    overlay: Throttled,
    main: Throttled,
}

fn overlay_interval(fps: u32) -> Duration {
    Duration::from_micros(1_000_000 / u64::from(fps.max(1)))
}

impl UiEmitter {
    fn emit(&mut self, app: &AppHandle, state: &GameState, overlay_fps: u32) {
        let mut key = state.clone();
        key.time = None;
        let meaningful = self.key.as_ref() != Some(&key);
        self.key = Some(key);

        // Starting/leaving a play must reach the overlay at once (it shows/hides widgets).
        let transition = meaningful && state.gameplay.is_none();
        if state.gameplay.is_some() || meaningful {
            self.overlay.offer(
                app,
                crate::overlay::LABEL,
                state,
                overlay_interval(overlay_fps),
                transition,
            );
        }
        let idle_dashboard = state.gameplay.is_none() && meaningful;
        self.main
            .offer(app, "main", state, IDLE_UI_INTERVAL, idle_dashboard);
    }

    fn flush(&mut self, app: &AppHandle, overlay_fps: u32) {
        self.overlay
            .flush(app, crate::overlay::LABEL, overlay_interval(overlay_fps));
        self.main.flush(app, "main", IDLE_UI_INTERVAL);
    }
}

fn status_for(e: &ReaderError) -> ReaderStatus {
    match e {
        ReaderError::ProcessNotFound => ReaderStatus::Waiting,
        other => ReaderStatus::Error {
            message: other.to_string(),
        },
    }
}

fn publish_status(ctx: &ReaderContext, status: ReaderStatus) {
    if ctx.hub.status() == status {
        return;
    }
    match &status {
        ReaderStatus::Waiting => ctx.diag.info(&ctx.app, "reader", "waiting for osu!lazer"),
        ReaderStatus::Connecting => ctx.diag.info(
            &ctx.app,
            "reader",
            "osu!lazer found, locating the game's objects",
        ),
        ReaderStatus::Connected {
            version,
            connect_ms,
            ..
        } => ctx.diag.info(
            &ctx.app,
            "reader",
            format!(
                "connected to {version} in {:.1} s",
                *connect_ms as f64 / 1000.0
            ),
        ),
        ReaderStatus::Error { message } => ctx.diag.error(&ctx.app, "reader", message.clone()),
    }
    let _ = ctx.app.emit(EVENT_READER_STATUS, &status);
    ctx.hub.publish_status(status);
}

/// Publishes a state outside the polling loop (resetting it when the game goes away).
fn publish_game(ctx: &ReaderContext, state: GameState) {
    let _ = ctx.app.emit(EVENT_GAME_STATE, &state);
    ctx.hub.publish_state(state);
}
