//! The live terminal UI: every value the reader publishes, grouped like the API groups it, plus
//! an explorer of the game's whole object graph to find what the reader does not read yet.
//!
//! A worker thread owns the game session (connecting takes seconds, so it must not block the
//! screen) and sends snapshots; the UI thread only draws and handles keys.

use std::cell::RefCell;
use std::collections::HashMap;
use std::io::Write as _;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::Result;
use lazer_reader::session::LazerSession;
use ratatui::crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style, Stylize};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, ListState, Paragraph, Tabs, Wrap};
use ratatui::{DefaultTerminal, Frame};
use serde_json::Value;

use crate::explorer::{self, Hit, View};
use crate::status::{self, ProcessInfo};

const SNAPSHOT_EVERY: Duration = Duration::from_millis(100);
const EXPLORE_EVERY: Duration = Duration::from_millis(200);
const INPUT_EVERY: Duration = Duration::from_millis(4);
const HIGHLIGHT_FOR: Duration = Duration::from_millis(700);
const SEARCH_DEPTH: usize = 7;
const PINS_FILE: &str = "lazer-probe-pins.txt";
const PATHS_FILE: &str = "lazer-probe-paths.txt";
const PINK: Color = Color::Rgb(255, 102, 170);
const SELECTED: Color = Color::Rgb(60, 30, 50);

/// What the UI asks the worker for. Shared, read every cycle.
#[derive(Clone, Default)]
struct Control {
    inputs: bool,
    /// Object to browse (path from the root); `None` while the explorer is not on screen.
    explore: Option<Vec<String>>,
    pins: Vec<Vec<String>>,
    /// Text to look for in the whole object graph; taken by the worker.
    search: Option<String>,
}

enum Msg {
    /// Not connected: why, and the processes that were considered.
    Waiting {
        reason: String,
        candidates: Vec<String>,
    },
    Connected(Box<Link>),
    State(Value, Duration),
    Inputs(Value),
    Explore(Vec<String>, Result<View, String>),
    /// `(value, type)` of each pinned field, in pin order.
    Pins(Vec<Result<(String, String), String>>),
    Searching(String),
    Hits(String, Vec<Hit>, String),
    Lost(String),
}

/// What is known about the current connection.
struct Link {
    info: ProcessInfo,
    profile: String,
    root: u64,
    connect_ms: u128,
}

fn worker(tx: &Sender<Msg>, control: &Mutex<Control>, stop: &AtomicBool) {
    let ctl = || control.lock().map(|c| c.clone()).unwrap_or_default();
    while !stop.load(Ordering::Relaxed) {
        let started = Instant::now();
        let mut session = match LazerSession::connect() {
            Ok(s) => s,
            Err(e) => {
                let candidates = status::candidates()
                    .into_iter()
                    .map(|(pid, name, verdict)| match verdict {
                        Ok(()) => format!("{pid} {name}: lazer build"),
                        Err(why) => format!("{pid} {name}: {why}"),
                    })
                    .collect();
                let _ = tx.send(Msg::Waiting {
                    reason: e.to_string(),
                    candidates,
                });
                std::thread::sleep(Duration::from_secs(1));
                continue;
            }
        };
        let _ = tx.send(Msg::Connected(Box::new(Link {
            info: ProcessInfo::read(session.process()),
            profile: session.profile().source.to_owned(),
            root: session.root_address(),
            connect_ms: started.elapsed().as_millis(),
        })));
        let (mut next_snapshot, mut next_explore, mut failures) =
            (Instant::now(), Instant::now(), 0u32);
        let reason = loop {
            if stop.load(Ordering::Relaxed) {
                return;
            }
            if !session.is_alive() {
                break "the game exited".to_owned();
            }
            let wanted = ctl();
            if wanted.inputs
                && let Ok(held) = session.read_inputs()
                && let Ok(v) = serde_json::to_value(held)
            {
                let _ = tx.send(Msg::Inputs(v));
            }
            if next_snapshot <= Instant::now() {
                let tick = Instant::now();
                match session.snapshot() {
                    Ok(state) => {
                        failures = 0;
                        if let Ok(v) = serde_json::to_value(&state) {
                            let _ = tx.send(Msg::State(v, tick.elapsed()));
                        }
                    }
                    Err(e) => {
                        failures += 1;
                        if failures >= 20 {
                            break e.to_string();
                        }
                    }
                }
                next_snapshot = Instant::now() + SNAPSHOT_EVERY;
            }
            let (clr, root) = (session.clr(), session.root_address());
            if next_explore <= Instant::now() {
                if let Some(path) = &wanted.explore {
                    let _ = tx.send(Msg::Explore(
                        path.clone(),
                        explorer::browse(clr, root, path),
                    ));
                }
                if !wanted.pins.is_empty() {
                    let values = wanted
                        .pins
                        .iter()
                        .map(|p| explorer::read_pin(clr, root, p))
                        .collect();
                    let _ = tx.send(Msg::Pins(values));
                }
                next_explore = Instant::now() + EXPLORE_EVERY;
            }
            if let Some(query) = wanted.search {
                if let Ok(mut c) = control.lock() {
                    c.search = None;
                }
                let _ = tx.send(Msg::Searching(query.clone()));
                let (hits, note) = explorer::search(clr, root, &query, SEARCH_DEPTH);
                let _ = tx.send(Msg::Hits(query, hits, note));
            }
            std::thread::sleep(INPUT_EVERY);
        };
        let _ = tx.send(Msg::Lost(reason));
        std::thread::sleep(Duration::from_secs(1));
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Tab {
    Overview,
    Game,
    Player,
    Beatmap,
    User,
    Inputs,
    Explorer,
    Watch,
    Process,
    Raw,
}

const TABS: [(Tab, &str); 10] = [
    (Tab::Overview, "Overview"),
    (Tab::Game, "Game"),
    (Tab::Player, "Player"),
    (Tab::Beatmap, "Beatmap"),
    (Tab::User, "User"),
    (Tab::Inputs, "Inputs"),
    (Tab::Explorer, "Explorer"),
    (Tab::Watch, "Watch"),
    (Tab::Process, "Process"),
    (Tab::Raw, "Raw"),
];

/// Which tab shows a top-level field of the game state.
fn tab_of(field: &str) -> Tab {
    match field {
        "gameplay" | "personalBest" => Tab::Player,
        "beatmap" | "difficulty" | "difficultyGraph" => Tab::Beatmap,
        "user" | "spectators" | "spectatorCount" => Tab::User,
        _ => Tab::Game,
    }
}

enum Status {
    Waiting {
        reason: String,
        candidates: Vec<String>,
    },
    Connected(Box<Link>),
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PromptKind {
    Filter,
    Find,
    Goto,
}

/// A value followed over time: when it last changed and how often.
struct Tracked {
    value: String,
    at: Instant,
    count: u32,
}

impl Tracked {
    fn hot(&self) -> bool {
        self.count > 0 && self.at.elapsed() < HIGHLIGHT_FOR
    }
}

fn track(map: &mut HashMap<String, Tracked>, key: String, value: &str) {
    match map.get_mut(&key) {
        Some(t) if t.value != value => {
            t.value = value.to_owned();
            t.at = Instant::now();
            t.count += 1;
        }
        Some(_) => {}
        None => {
            map.insert(
                key,
                Tracked {
                    value: value.to_owned(),
                    at: Instant::now(),
                    count: 0,
                },
            );
        }
    }
}

struct App {
    tab: usize,
    scroll: u16,
    filter: String,
    prompt: Option<(PromptKind, String)>,
    paused: bool,
    status: Status,
    state: Option<Value>,
    shown: Option<Value>,
    latency: Duration,
    worst: Duration,
    updates: u64,
    changed: HashMap<String, Instant>,
    previous: HashMap<String, String>,
    inputs: Value,
    input_log: Vec<String>,
    notice: Option<(String, Instant)>,
    // Explorer.
    path: Vec<String>,
    cursor: Vec<usize>,
    sel: usize,
    view: Option<Result<View, String>>,
    row_track: HashMap<String, Tracked>,
    select_label: Option<String>,
    hits: Option<(String, Vec<Hit>, String)>,
    hit_sel: usize,
    searching: Option<String>,
    // Watch.
    pins: Vec<Vec<String>>,
    pin_values: Vec<Result<(String, String), String>>,
    pin_track: HashMap<String, Tracked>,
    pin_sel: usize,
    list: RefCell<ListState>,
}

impl App {
    fn new() -> Self {
        let pins = std::fs::read_to_string(PINS_FILE)
            .map(|t| {
                t.lines()
                    .filter(|l| !l.trim().is_empty())
                    .map(|l| l.trim().split('.').map(str::to_owned).collect())
                    .collect()
            })
            .unwrap_or_default();
        Self {
            tab: 0,
            scroll: 0,
            filter: String::new(),
            prompt: None,
            paused: false,
            status: Status::Waiting {
                reason: "starting".into(),
                candidates: Vec::new(),
            },
            state: None,
            shown: None,
            latency: Duration::ZERO,
            worst: Duration::ZERO,
            updates: 0,
            changed: HashMap::new(),
            previous: HashMap::new(),
            inputs: Value::Null,
            input_log: Vec::new(),
            notice: None,
            path: Vec::new(),
            cursor: Vec::new(),
            sel: 0,
            view: None,
            row_track: HashMap::new(),
            select_label: None,
            hits: None,
            hit_sel: 0,
            searching: None,
            pins,
            pin_values: Vec::new(),
            pin_track: HashMap::new(),
            pin_sel: 0,
            list: RefCell::new(ListState::default()),
        }
    }

    fn tab(&self) -> Tab {
        TABS[self.tab].0
    }

    fn tell(&mut self, text: impl Into<String>) {
        self.notice = Some((text.into(), Instant::now()));
    }

    fn apply(&mut self, msg: Msg) {
        match msg {
            Msg::Waiting { reason, candidates } => {
                self.status = Status::Waiting { reason, candidates };
                self.state = None;
                self.shown = None;
            }
            Msg::Connected(link) => {
                self.status = Status::Connected(link);
                self.worst = Duration::ZERO;
            }
            Msg::State(v, took) => {
                self.latency = took;
                self.worst = self.worst.max(took);
                self.updates += 1;
                if !self.paused {
                    self.track_changes(&v);
                    self.shown = Some(v.clone());
                }
                self.state = Some(v);
            }
            Msg::Inputs(v) => {
                if v != self.inputs {
                    let held = |k: &str| -> Vec<String> {
                        v[k].as_array()
                            .map(|a| {
                                a.iter()
                                    .filter_map(|x| x.as_str().map(str::to_owned))
                                    .collect()
                            })
                            .unwrap_or_default()
                    };
                    let line = format!(
                        "keys [{}]  mouse [{}]",
                        held("keys").join(" "),
                        held("mouse").join(" ")
                    );
                    self.input_log.push(line);
                    if self.input_log.len() > 200 {
                        self.input_log.remove(0);
                    }
                    self.inputs = v;
                }
            }
            Msg::Explore(path, view) => {
                // An answer for a place we already left is stale.
                if path != self.path {
                    return;
                }
                if let Ok(v) = &view {
                    let prefix = self.path.join(".");
                    for row in &v.rows {
                        track(
                            &mut self.row_track,
                            format!("{prefix}|{}", row.label),
                            &row.value,
                        );
                    }
                    if let Some(label) = self.select_label.take()
                        && let Some(i) = v.rows.iter().position(|r| r.label == label)
                    {
                        self.sel = i;
                    }
                }
                self.view = Some(view);
            }
            Msg::Pins(values) => {
                for (path, value) in self.pins.iter().zip(&values) {
                    if let Ok((v, _)) = value {
                        track(&mut self.pin_track, path.join("."), v);
                    }
                }
                self.pin_values = values;
            }
            Msg::Searching(q) => self.searching = Some(q),
            Msg::Hits(q, hits, note) => {
                self.searching = None;
                self.hit_sel = 0;
                self.hits = Some((q, hits, note));
            }
            Msg::Lost(reason) => {
                self.status = Status::Waiting {
                    reason,
                    candidates: Vec::new(),
                };
                self.state = None;
                self.shown = None;
                self.view = None;
            }
        }
    }

    fn track_changes(&mut self, state: &Value) {
        let mut flat = Vec::new();
        flatten("", state, &mut flat);
        let now = Instant::now();
        for (key, value) in flat {
            if self.previous.get(&key).is_some_and(|old| *old != value) {
                self.changed.insert(key.clone(), now);
            }
            self.previous.insert(key, value);
        }
        self.changed.retain(|_, at| at.elapsed() < HIGHLIGHT_FOR);
    }

    fn save_snapshot(&mut self) {
        let Some(state) = &self.shown else {
            self.tell("nothing to save yet");
            return;
        };
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_secs());
        let path = format!("lazer-probe-{stamp}.json");
        let text = serde_json::to_string_pretty(state).unwrap_or_default();
        let msg = match std::fs::write(&path, text) {
            Ok(()) => format!("saved {path}"),
            Err(e) => format!("could not save: {e}"),
        };
        self.tell(msg);
    }

    /// Rows of the browsed object that pass the filter.
    fn rows(&self) -> Vec<&explorer::Row> {
        let needle = self.filter.to_lowercase();
        match &self.view {
            Some(Ok(v)) => v
                .rows
                .iter()
                .filter(|r| {
                    needle.is_empty()
                        || r.label.to_lowercase().contains(&needle)
                        || r.value.to_lowercase().contains(&needle)
                        || r.ty.to_lowercase().contains(&needle)
                })
                .collect(),
            _ => Vec::new(),
        }
    }

    fn go_to(&mut self, path: Vec<String>, select: Option<String>) {
        self.path = path;
        self.cursor.clear();
        self.sel = 0;
        self.view = None;
        self.select_label = select;
        self.filter.clear();
    }

    fn drill(&mut self) {
        let Some(row) = self.rows().get(self.sel).map(|r| (*r).clone()) else {
            return;
        };
        let (Some(seg), Some(_)) = (row.seg, row.child) else {
            self.tell("not a reference to an object");
            return;
        };
        self.cursor.push(self.sel);
        self.path.push(seg);
        self.sel = 0;
        self.view = None;
        self.filter.clear();
    }

    fn up(&mut self) {
        if self.path.pop().is_some() {
            self.sel = self.cursor.pop().unwrap_or(0);
            self.view = None;
            self.filter.clear();
        }
    }

    /// Path of the selected row, field name last.
    fn selected_path(&self) -> Option<Vec<String>> {
        let row = self.rows().get(self.sel).copied()?;
        let mut p = self.path.clone();
        p.push(row.seg.clone()?);
        Some(p)
    }

    fn pin(&mut self) {
        let Some(path) = self.selected_path() else {
            return;
        };
        if self.pins.contains(&path) {
            self.tell("already watched");
            return;
        }
        let text = path.join(".");
        self.pins.push(path);
        self.save_pins();
        self.tell(format!("watching {text}  (tab 8)"));
    }

    fn save_pins(&self) {
        let text: String = self
            .pins
            .iter()
            .map(|p| format!("{}\n", p.join(".")))
            .collect();
        let _ = std::fs::write(PINS_FILE, text);
    }

    /// The path as the `&[...]` slice `profile.rs` wants, appended to a file as well.
    fn export(&mut self) {
        let Some(path) = self.selected_path() else {
            return;
        };
        let names: Vec<String> = path
            .iter()
            .filter(|s| !s.starts_with('@'))
            .map(|s| format!("{s:?}"))
            .collect();
        let snippet = format!("&[{}]", names.join(", "));
        let wrote = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(PATHS_FILE)
            .and_then(|mut f| writeln!(f, "{snippet}"));
        self.tell(match wrote {
            Ok(()) => format!("{snippet}  (added to {PATHS_FILE})"),
            Err(e) => format!("{snippet}  (could not write file: {e})"),
        });
    }
}

/// Flattens JSON to `path -> value` lines. Long lists of numbers are summarised, not spread.
fn flatten(prefix: &str, value: &Value, out: &mut Vec<(String, String)>) {
    match value {
        Value::Object(map) if !map.is_empty() => {
            for (k, v) in map {
                let path = if prefix.is_empty() {
                    k.clone()
                } else {
                    format!("{prefix}.{k}")
                };
                flatten(&path, v, out);
            }
        }
        Value::Object(_) => out.push((prefix.to_owned(), "{}".into())),
        Value::Array(items) if items.is_empty() => out.push((prefix.to_owned(), "[]".into())),
        Value::Array(items) if items.iter().all(|x| !x.is_object() && !x.is_array()) => {
            let shown: Vec<String> = items.iter().take(6).map(scalar).collect();
            let more = if items.len() > 6 {
                format!(
                    " … ({} items, last {})",
                    items.len(),
                    items.last().map_or_else(String::new, scalar)
                )
            } else {
                String::new()
            };
            out.push((prefix.to_owned(), format!("[{}]{more}", shown.join(", "))));
        }
        Value::Array(items) => {
            for (i, v) in items.iter().take(40).enumerate() {
                flatten(&format!("{prefix}[{i}]"), v, out);
            }
            if items.len() > 40 {
                out.push((format!("{prefix}[…]"), format!("{} more", items.len() - 40)));
            }
        }
        other => out.push((prefix.to_owned(), scalar(other))),
    }
}

fn scalar(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::String(s) => format!("{s:?}"),
        Value::Number(n) => n.as_f64().filter(|f| f.fract() != 0.0).map_or_else(
            || n.to_string(),
            |f| format!("{f:.4}").trim_end_matches('0').to_owned(),
        ),
        other => other.to_string(),
    }
}

fn value_style(raw: &str) -> Style {
    match raw {
        "true" => Style::new().fg(Color::Green),
        "false" => Style::new().fg(Color::Red),
        "null" | "[]" | "{}" => Style::new().fg(Color::DarkGray),
        s if s.starts_with('"') => Style::new().fg(Color::White),
        s if s.starts_with('[') => Style::new().fg(Color::Magenta),
        _ => Style::new().fg(Color::Cyan),
    }
}

pub fn run() -> Result<()> {
    let (tx, rx) = channel();
    let control = Arc::new(Mutex::new(Control::default()));
    let stop = Arc::new(AtomicBool::new(false));
    let handle = {
        let (control, stop) = (control.clone(), stop.clone());
        std::thread::spawn(move || worker(&tx, &control, &stop))
    };
    let mut terminal = ratatui::init();
    let result = event_loop(&mut terminal, &rx, &control);
    ratatui::restore();
    stop.store(true, Ordering::Relaxed);
    // The worker may be inside a long heap scan: do not wait for it, the process is about to exit.
    drop(handle);
    result
}

fn event_loop(
    terminal: &mut DefaultTerminal,
    rx: &Receiver<Msg>,
    control: &Mutex<Control>,
) -> Result<()> {
    let mut app = App::new();
    loop {
        while let Ok(msg) = rx.try_recv() {
            app.apply(msg);
        }
        if let Ok(mut c) = control.lock() {
            c.inputs = app.tab() == Tab::Inputs;
            c.explore = (app.tab() == Tab::Explorer).then(|| app.path.clone());
            c.pins.clone_from(&app.pins);
        }
        terminal.draw(|f| draw(f, &app))?;
        if !event::poll(Duration::from_millis(33))? {
            continue;
        }
        let Event::Key(key) = event::read()? else {
            continue;
        };
        if key.kind != KeyEventKind::Press {
            continue;
        }
        if app.prompt.is_some() {
            handle_prompt(&mut app, control, key.code);
            continue;
        }
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
        if key.code == KeyCode::Char('c') && ctrl {
            return Ok(());
        }
        if !handle_key(&mut app, key.code) {
            return Ok(());
        }
    }
}

fn handle_prompt(app: &mut App, control: &Mutex<Control>, code: KeyCode) {
    let Some((kind, text)) = app.prompt.as_mut() else {
        return;
    };
    match code {
        KeyCode::Esc => {
            if *kind == PromptKind::Filter {
                app.filter.clear();
            }
            app.prompt = None;
        }
        KeyCode::Enter => {
            let (kind, text) = (*kind, text.clone());
            app.prompt = None;
            match kind {
                PromptKind::Filter => {}
                PromptKind::Find if !text.is_empty() => {
                    if let Ok(mut c) = control.lock() {
                        c.search = Some(text);
                    }
                    app.hits = None;
                }
                PromptKind::Find => {}
                PromptKind::Goto => {
                    let hex = text.trim().trim_start_matches("0x");
                    if u64::from_str_radix(hex, 16).is_ok() {
                        app.go_to(vec![format!("@{hex}")], None);
                    } else {
                        app.tell("not a hex address");
                    }
                }
            }
        }
        KeyCode::Backspace => {
            text.pop();
            if *kind == PromptKind::Filter {
                app.filter.clone_from(text);
            }
        }
        KeyCode::Char(c) => {
            text.push(c);
            if *kind == PromptKind::Filter {
                app.filter.clone_from(text);
            }
        }
        _ => {}
    }
}

fn step(cur: usize, down: bool, by: usize, len: usize) -> usize {
    if down {
        (cur + by).min(len.saturating_sub(1))
    } else {
        cur.saturating_sub(by)
    }
}

/// Returns `false` to quit.
fn handle_key(app: &mut App, code: KeyCode) -> bool {
    let tab = app.tab();
    let on_list = matches!(tab, Tab::Explorer | Tab::Watch);
    let in_hits = tab == Tab::Explorer && app.hits.is_some();
    match code {
        KeyCode::Char('q') => return false,
        KeyCode::Esc if in_hits => app.hits = None,
        KeyCode::Esc => return false,
        KeyCode::Tab => {
            app.tab = (app.tab + 1) % TABS.len();
            app.scroll = 0;
        }
        KeyCode::BackTab => {
            app.tab = (app.tab + TABS.len() - 1) % TABS.len();
            app.scroll = 0;
        }
        KeyCode::Right if tab == Tab::Explorer && !in_hits => app.drill(),
        KeyCode::Left if tab == Tab::Explorer && !in_hits => app.up(),
        KeyCode::Right | KeyCode::Char('l') => {
            app.tab = (app.tab + 1) % TABS.len();
            app.scroll = 0;
        }
        KeyCode::Left | KeyCode::Char('h') => {
            app.tab = (app.tab + TABS.len() - 1) % TABS.len();
            app.scroll = 0;
        }
        KeyCode::Char(c @ '1'..='9') => {
            app.tab = c as usize - '1' as usize;
            app.scroll = 0;
        }
        KeyCode::Char('0') => app.tab = 9,
        KeyCode::Down | KeyCode::Char('j') | KeyCode::PageDown if on_list => {
            let by = if code == KeyCode::PageDown { 15 } else { 1 };
            if in_hits {
                let len = app.hits.as_ref().map_or(0, |h| h.1.len());
                app.hit_sel = step(app.hit_sel, true, by, len);
            } else if tab == Tab::Explorer {
                app.sel = step(app.sel, true, by, app.rows().len());
            } else {
                app.pin_sel = step(app.pin_sel, true, by, app.pins.len());
            }
        }
        KeyCode::Up | KeyCode::Char('k') | KeyCode::PageUp if on_list => {
            let by = if code == KeyCode::PageUp { 15 } else { 1 };
            if in_hits {
                app.hit_sel = step(app.hit_sel, false, by, 0);
            } else if tab == Tab::Explorer {
                app.sel = step(app.sel, false, by, 0);
            } else {
                app.pin_sel = step(app.pin_sel, false, by, 0);
            }
        }
        KeyCode::Down | KeyCode::Char('j') => app.scroll = app.scroll.saturating_add(1),
        KeyCode::Up | KeyCode::Char('k') => app.scroll = app.scroll.saturating_sub(1),
        KeyCode::PageDown => app.scroll = app.scroll.saturating_add(15),
        KeyCode::PageUp => app.scroll = app.scroll.saturating_sub(15),
        KeyCode::Home => app.scroll = 0,
        KeyCode::Enter if in_hits => {
            let hit = app
                .hits
                .as_ref()
                .and_then(|(_, hits, _)| hits.get(app.hit_sel).cloned());
            if let Some(mut hit) = hit
                && let Some(last) = hit.path.pop()
            {
                app.hits = None;
                app.go_to(hit.path, Some(last));
            }
        }
        KeyCode::Enter | KeyCode::Char('o') if tab == Tab::Explorer => app.drill(),
        KeyCode::Enter if tab == Tab::Watch => {
            if let Some(mut path) = app.pins.get(app.pin_sel).cloned()
                && let Some(last) = path.pop()
            {
                app.tab = TABS
                    .iter()
                    .position(|(t, _)| *t == Tab::Explorer)
                    .unwrap_or(0);
                app.go_to(path, Some(last));
            }
        }
        KeyCode::Backspace if tab == Tab::Explorer => app.up(),
        KeyCode::Char('r') if tab == Tab::Explorer => {
            app.hits = None;
            app.go_to(Vec::new(), None);
        }
        KeyCode::Char('g') if tab == Tab::Explorer => {
            app.prompt = Some((PromptKind::Goto, String::new()));
        }
        KeyCode::Char('f') if tab == Tab::Explorer => {
            app.prompt = Some((PromptKind::Find, String::new()));
        }
        KeyCode::Char('w') if tab == Tab::Explorer => app.pin(),
        KeyCode::Char('y') if tab == Tab::Explorer => app.export(),
        KeyCode::Char('x') | KeyCode::Delete if tab == Tab::Watch => {
            if app.pin_sel < app.pins.len() {
                let gone = app.pins.remove(app.pin_sel);
                app.pin_track.remove(&gone.join("."));
                app.pin_values.clear();
                app.pin_sel = app.pin_sel.min(app.pins.len().saturating_sub(1));
                app.save_pins();
            }
        }
        KeyCode::Char('/') => app.prompt = Some((PromptKind::Filter, app.filter.clone())),
        KeyCode::Char('p' | ' ') => {
            app.paused = !app.paused;
            if !app.paused {
                app.shown.clone_from(&app.state);
            }
        }
        KeyCode::Char('s') => app.save_snapshot(),
        _ => {}
    }
    true
}

fn draw(f: &mut Frame, app: &App) {
    let [header, body, footer] = Layout::vertical([
        Constraint::Length(3),
        Constraint::Min(3),
        Constraint::Length(1),
    ])
    .areas(f.area());

    let titles: Vec<Line> = TABS
        .iter()
        .enumerate()
        .map(|(i, (_, name))| Line::from(format!("{} {name}", (i + 1) % 10)))
        .collect();
    let (dot, summary) = match &app.status {
        Status::Connected(link) => (
            Span::styled("● ", Style::new().fg(Color::Green)),
            format!(
                "pid {} · {} · {:?} snapshot (worst {:?})",
                link.info.pid,
                link.info.version.as_ref().map_or_else(
                    || "dev build".to_owned(),
                    |v| format!("{} {}", v.stream(), v.release)
                ),
                app.latency,
                app.worst
            ),
        ),
        Status::Waiting { .. } => (
            Span::styled("● ", Style::new().fg(Color::Yellow)),
            "waiting for a game".to_owned(),
        ),
    };
    f.render_widget(
        Tabs::new(titles)
            .select(app.tab)
            .highlight_style(Style::new().fg(PINK).add_modifier(Modifier::BOLD))
            .divider("│")
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_style(Style::new().fg(Color::DarkGray))
                    .title(Line::from(vec![
                        Span::raw(" lazer-probe "),
                        dot,
                        Span::raw(format!("{summary} ")),
                    ])),
            ),
        header,
    );

    let tab = app.tab();
    match tab {
        Tab::Overview => draw_overview(f, body, app),
        Tab::Inputs => draw_inputs(f, body, app),
        Tab::Explorer => draw_explorer(f, body, app),
        Tab::Watch => draw_watch(f, body, app),
        Tab::Process => draw_process(f, body, app),
        Tab::Raw => draw_raw(f, body, app),
        _ => draw_fields(f, body, app, tab),
    }

    let notice = app
        .notice
        .as_ref()
        .filter(|(_, at)| at.elapsed() < Duration::from_secs(6));
    let hint = if let Some((kind, text)) = &app.prompt {
        let what = match kind {
            PromptKind::Filter => "filter",
            PromptKind::Find => "find in the whole game (field name, type or value)",
            PromptKind::Goto => "go to address (hex)",
        };
        format!(" {what}: {text}▏  (Enter ok, Esc cancel)")
    } else if let Some((msg, _)) = notice {
        format!(" {msg}")
    } else {
        let keys = match tab {
            Tab::Explorer => {
                "↑↓ select · →/Enter open · ←/Bksp up · f find · w watch · y copy path · g goto · r root · / filter"
            }
            Tab::Watch => "↑↓ select · Enter show in Explorer · x remove",
            _ => "←→/1-9,0 tabs · ↑↓ scroll · / filter · p pause · s save snapshot",
        };
        let filter = if app.filter.is_empty() {
            String::new()
        } else {
            format!("  [filter: {}]", app.filter)
        };
        format!(
            " {keys}{} · q quit{filter}",
            if app.paused { " · PAUSED" } else { "" }
        )
    };
    f.render_widget(Paragraph::new(hint).fg(Color::DarkGray), footer);
}

fn panel(title: &str) -> Block<'_> {
    Block::default()
        .borders(Borders::ALL)
        .border_style(Style::new().fg(Color::DarkGray))
        .title(format!(" {title} "))
}

fn kv<'a>(key: &str, value: String, width: usize) -> Line<'a> {
    Line::from(vec![
        Span::styled(format!("{key:<width$}"), Style::new().fg(Color::Gray)),
        Span::raw(value),
    ])
}

fn pad(text: &str, width: usize) -> String {
    let cut: String = text.chars().take(width).collect();
    format!("{cut:<width$}")
}

fn draw_explorer(f: &mut Frame, area: Rect, app: &App) {
    if let Some((query, hits, note)) = &app.hits {
        let items: Vec<ListItem> = hits
            .iter()
            .map(|h| {
                ListItem::new(Line::from(vec![
                    Span::styled(
                        pad(&explorer::show_path(&h.path), 70),
                        Style::new().fg(Color::Cyan),
                    ),
                    Span::styled(
                        format!(" {} ", pad(&h.ty, 18)),
                        Style::new().fg(Color::DarkGray),
                    ),
                    Span::styled(h.value.clone(), value_style(&h.value)),
                ]))
            })
            .collect();
        let mut state = app.list.borrow_mut();
        state.select(Some(app.hit_sel));
        f.render_stateful_widget(
            List::new(items)
                .highlight_style(Style::new().bg(SELECTED))
                .block(panel(&format!(
                    "Find {query:?} · {} hits · {note} · Enter opens, Esc back",
                    hits.len()
                ))),
            area,
            &mut state,
        );
        return;
    }
    if let Some(q) = &app.searching {
        f.render_widget(
            Paragraph::new(format!("Searching the game's objects for {q:?} …"))
                .block(panel("Find")),
            area,
        );
        return;
    }
    let crumbs = if app.path.is_empty() {
        "root".to_owned()
    } else {
        format!("root › {}", app.path.join(" › "))
    };
    let title = match &app.view {
        Some(Ok(v)) => format!("{crumbs}  ({} @ {:#x})", v.type_name, v.addr),
        Some(Err(e)) => format!("{crumbs}  ({e})"),
        None => format!("{crumbs}  (loading)"),
    };
    let rows = app.rows();
    let prefix = app.path.join(".");
    let items: Vec<ListItem> = rows
        .iter()
        .map(|r| {
            let t = app.row_track.get(&format!("{prefix}|{}", r.label));
            let style = if t.is_some_and(Tracked::hot) {
                Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD)
            } else {
                value_style(&r.value)
            };
            let label_color = if r.child.is_some() {
                Color::Cyan
            } else {
                Color::Gray
            };
            let count = t
                .filter(|t| t.count > 0)
                .map_or_else(String::new, |t| format!("  Δ{}", t.count));
            ListItem::new(Line::from(vec![
                Span::styled(
                    r.offset
                        .map_or_else(|| "      ".into(), |o| format!("+{o:#05x} ")),
                    Style::new().fg(Color::DarkGray),
                ),
                Span::styled(pad(&r.label, 40), Style::new().fg(label_color)),
                Span::styled(
                    format!(" {} ", pad(&r.ty, 22)),
                    Style::new().fg(Color::DarkGray),
                ),
                Span::styled(r.value.clone(), style),
                Span::styled(count, Style::new().fg(Color::Yellow)),
            ]))
        })
        .collect();
    let count = items.len();
    let mut state = app.list.borrow_mut();
    state.select(Some(app.sel.min(count.saturating_sub(1))));
    f.render_stateful_widget(
        List::new(items)
            .highlight_style(Style::new().bg(SELECTED))
            .block(panel(&format!("{title} · {count} fields"))),
        area,
        &mut state,
    );
}

fn draw_watch(f: &mut Frame, area: Rect, app: &App) {
    if app.pins.is_empty() {
        f.render_widget(
            Paragraph::new(
                "Nothing watched yet.\n\nIn the Explorer (tab 7), select a field and press w.\n\
                 Do something in the game: the fields that react flash and count their changes (Δ).\n\
                 Watched paths are kept in lazer-probe-pins.txt.",
            )
            .block(panel("Watch")),
            area,
        );
        return;
    }
    let items: Vec<ListItem> = app
        .pins
        .iter()
        .enumerate()
        .map(|(i, path)| {
            let key = path.join(".");
            let t = app.pin_track.get(&key);
            let (value, style) = match app.pin_values.get(i) {
                Some(Ok((v, _))) if t.is_some_and(Tracked::hot) => (
                    v.clone(),
                    Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD),
                ),
                Some(Ok((v, _))) => (v.clone(), value_style(v)),
                Some(Err(e)) => (e.clone(), Style::new().fg(Color::Red)),
                None => ("…".into(), Style::new().fg(Color::DarkGray)),
            };
            let count = t
                .filter(|t| t.count > 0)
                .map_or_else(String::new, |t| format!("  Δ{}", t.count));
            ListItem::new(Line::from(vec![
                Span::styled(pad(&key, 70), Style::new().fg(Color::Cyan)),
                Span::raw(" "),
                Span::styled(value, style),
                Span::styled(count, Style::new().fg(Color::Yellow)),
            ]))
        })
        .collect();
    let mut state = app.list.borrow_mut();
    state.select(Some(app.pin_sel));
    f.render_stateful_widget(
        List::new(items)
            .highlight_style(Style::new().bg(SELECTED))
            .block(panel(&format!("Watch · {} fields", app.pins.len()))),
        area,
        &mut state,
    );
}

fn draw_fields(f: &mut Frame, area: Rect, app: &App, tab: Tab) {
    let title = TABS.iter().find(|(t, _)| *t == tab).map_or("", |(_, n)| n);
    let Some(Value::Object(map)) = &app.shown else {
        f.render_widget(
            Paragraph::new("No data yet: the game is not connected.").block(panel(title)),
            area,
        );
        return;
    };
    let mut rows = Vec::new();
    for (key, value) in map.iter().filter(|(k, _)| tab_of(k) == tab) {
        flatten(key, value, &mut rows);
    }
    let needle = app.filter.to_lowercase();
    rows.retain(|(k, v)| {
        needle.is_empty()
            || k.to_lowercase().contains(&needle)
            || v.to_lowercase().contains(&needle)
    });
    let width = rows
        .iter()
        .map(|(k, _)| k.chars().count())
        .max()
        .unwrap_or(0)
        .min(48);
    let lines: Vec<Line> = rows
        .iter()
        .map(|(key, value)| {
            let hot = app
                .changed
                .get(key)
                .is_some_and(|at| at.elapsed() < HIGHLIGHT_FOR);
            let style = if hot {
                Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD)
            } else {
                value_style(value)
            };
            Line::from(vec![
                Span::styled(format!("{key:<width$}  "), Style::new().fg(Color::Gray)),
                Span::styled(value.clone(), style),
            ])
        })
        .collect();
    let count = lines.len();
    f.render_widget(
        Paragraph::new(lines)
            .scroll((app.scroll, 0))
            .block(panel(&format!("{title} · {count} fields"))),
        area,
    );
}

fn draw_raw(f: &mut Frame, area: Rect, app: &App) {
    let text = app
        .shown
        .as_ref()
        .and_then(|v| serde_json::to_string_pretty(v).ok())
        .unwrap_or_else(|| "no data yet".into());
    let needle = app.filter.to_lowercase();
    let lines: Vec<Line> = text
        .lines()
        .filter(|l| needle.is_empty() || l.to_lowercase().contains(&needle))
        .map(Line::from)
        .collect();
    f.render_widget(
        Paragraph::new(lines)
            .scroll((app.scroll, 0))
            .block(panel("Raw JSON (GameState)")),
        area,
    );
}

fn draw_inputs(f: &mut Frame, area: Rect, app: &App) {
    let [now, log] = Layout::vertical([Constraint::Length(5), Constraint::Min(3)]).areas(area);
    let names = |k: &str| -> String {
        app.inputs[k]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str())
                    .collect::<Vec<_>>()
                    .join("  ")
            })
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "—".into())
    };
    let lines = vec![
        Line::from(vec![
            Span::styled("keyboard  ", Style::new().fg(Color::Gray)),
            Span::styled(names("keys"), Style::new().fg(PINK).bold()),
        ]),
        Line::from(vec![
            Span::styled("mouse     ", Style::new().fg(Color::Gray)),
            Span::styled(names("mouse"), Style::new().fg(PINK).bold()),
        ]),
        Line::from(
            "the game's own view (a replay shows the keys it presses), sampled every few ms"
                .dark_gray(),
        ),
    ];
    f.render_widget(Paragraph::new(lines).block(panel("Held now")), now);
    let height = log.height.saturating_sub(2) as usize;
    let start = app.input_log.len().saturating_sub(height);
    let lines: Vec<Line> = app.input_log[start..]
        .iter()
        .map(|l| Line::from(l.as_str()))
        .collect();
    f.render_widget(Paragraph::new(lines).block(panel("Changes")), log);
}

fn draw_process(f: &mut Frame, area: Rect, app: &App) {
    let Status::Connected(link) = &app.status else {
        f.render_widget(
            Paragraph::new("Not attached.").block(panel("Process")),
            area,
        );
        return;
    };
    let info = &link.info;
    let [top, modules] = Layout::vertical([Constraint::Length(13), Constraint::Min(3)]).areas(area);
    let path = |p: &Option<PathBuf>| {
        p.as_ref()
            .map_or_else(|| "?".into(), |p| p.display().to_string())
    };
    let version = info
        .version
        .as_ref()
        .map_or_else(|| "none readable (dev build?)".into(), ToString::to_string);
    let stream = info
        .version
        .as_ref()
        .map_or_else(|| "dev".into(), |v| v.stream().to_owned());
    let key = info
        .version
        .as_ref()
        .map_or_else(|| "?".into(), lazer_reader::LazerVersion::profile_key);
    let lines = vec![
        kv("pid", info.pid.to_string(), 14),
        kv("exe", info.exe.display().to_string(), 14),
        kv("version", version, 14),
        kv("stream", stream, 14),
        kv("profile", format!("{} (key {key})", link.profile), 14),
        kv("install dir", path(&info.install_dir), 14),
        kv("data dir", path(&info.data_dir), 14),
        kv("root object", format!("{:#x}", link.root), 14),
        kv("connected in", format!("{} ms", link.connect_ms), 14),
        kv("private mem", format!("{} MiB", info.private_mib), 14),
        kv(
            "window",
            info.window.clone().unwrap_or_else(|| "?".into()),
            14,
        ),
    ];
    f.render_widget(
        Paragraph::new(lines)
            .wrap(Wrap { trim: false })
            .block(panel("Process")),
        top,
    );
    let needle = app.filter.to_lowercase();
    let lines: Vec<Line> = info
        .modules
        .iter()
        .filter(|(n, _, _)| needle.is_empty() || n.to_lowercase().contains(&needle))
        .map(|(n, base, size)| Line::from(format!("{base:#016x}  {:>8} KiB  {n}", size / 1024)))
        .collect();
    let count = lines.len();
    f.render_widget(
        Paragraph::new(lines)
            .scroll((app.scroll, 0))
            .block(panel(&format!("Modules · {count}"))),
        modules,
    );
}

fn draw_overview(f: &mut Frame, area: Rect, app: &App) {
    let mut lines = Vec::new();
    match &app.status {
        Status::Waiting { reason, candidates } => {
            lines.push(Line::from("Not connected".yellow().bold()));
            lines.push(Line::from(reason.as_str()));
            lines.push(Line::from(""));
            lines.push(Line::from(
                "Candidate processes (any program that loads osu.Game.dll works):".gray(),
            ));
            if candidates.is_empty() {
                lines.push(Line::from(
                    "  none found. Start osu!lazer, the tachyon stream or a dev build.".dark_gray(),
                ));
            }
            lines.extend(candidates.iter().map(|c| Line::from(format!("  {c}"))));
            lines.push(Line::from(""));
            lines.push(Line::from(
                "YAR_GAME_PID=<pid> forces one process when several builds run.".dark_gray(),
            ));
        }
        Status::Connected(link) => {
            let state = app.shown.as_ref();
            let get = |path: &str| -> String {
                let mut cur = state;
                for part in path.split('.') {
                    cur = cur.and_then(|v| v.get(part));
                }
                cur.map_or_else(
                    || "—".into(),
                    |v| v.as_str().map_or_else(|| scalar(v), str::to_owned),
                )
            };
            lines.push(Line::from("Connected".green().bold()));
            lines.push(kv(
                "build",
                link.info
                    .version
                    .as_ref()
                    .map_or_else(|| "dev build".into(), |v| format!("{} ({})", v.stream(), v)),
                12,
            ));
            lines.push(kv(
                "screen",
                format!("{}  ({})", get("screen"), get("screenType")),
                12,
            ));
            lines.push(kv("ruleset", get("ruleset"), 12));
            lines.push(kv("mods", get("mods"), 12));
            lines.push(kv(
                "beatmap",
                format!(
                    "{} - {} [{}]",
                    get("beatmap.artist"),
                    get("beatmap.title"),
                    get("beatmap.version")
                ),
                12,
            ));
            lines.push(kv("user", get("user.username"), 12));
            lines.push(kv("playing", get("playing"), 12));
            if state.is_some_and(|s| s.get("gameplay").is_some_and(|g| !g.is_null())) {
                lines.push(kv("score", get("gameplay.score"), 12));
                lines.push(kv("accuracy", get("gameplay.accuracy"), 12));
                lines.push(kv(
                    "combo",
                    format!(
                        "{} / {}",
                        get("gameplay.combo"),
                        get("gameplay.beatmapMaxCombo")
                    ),
                    12,
                ));
            }
            lines.push(Line::from(""));
            lines.push(kv("updates", app.updates.to_string(), 12));
            lines.push(kv(
                "last read",
                format!("{:?} (worst {:?})", app.latency, app.worst),
                12,
            ));
            lines.push(Line::from(""));
            lines.push(Line::from(
                "To find something the reader does not read yet: Explorer (7), then f to search."
                    .dark_gray(),
            ));
        }
    }
    f.render_widget(
        Paragraph::new(lines)
            .wrap(Wrap { trim: false })
            .block(panel("Overview")),
        area,
    );
}
