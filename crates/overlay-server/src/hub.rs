//! Shared state between the reader thread (producer) and the API (consumers).

use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, PoisonError, RwLock, RwLockReadGuard, RwLockWriteGuard};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use lazer_reader::events::{self, Event};
use lazer_reader::input::InputState;
use lazer_reader::model::{GameState, PersonalBestGhost, ReaderStatus};
use serde::Serialize;
use serde_json::Value;
use tokio::sync::broadcast;

/// Capacity of the broadcast channel; a client that falls further behind gets a fresh state.
const CHANNEL_CAPACITY: usize = 256;
/// Inputs change in bursts (a fast player presses ~15 keys a second, each press is two changes).
const INPUT_CHANNEL_CAPACITY: usize = 1024;

/// What the user configured, published read-only through `GET /api/v1/settings`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiSettings {
    /// How often the game memory is sampled, in milliseconds.
    pub poll_interval_ms: u64,
    /// How often the held keys and mouse buttons are sampled, in milliseconds (much faster than
    /// the game state: inputs are meant to be real time).
    pub input_poll_interval_ms: u64,
    pub port: u16,
}

/// A change of the held keys and mouse buttons, broadcast to the input WebSockets.
#[derive(Debug, Clone)]
pub struct InputUpdate {
    pub seq: u64,
    /// Unix time in milliseconds when the change was read.
    pub at: u64,
    pub state: Arc<InputState>,
}

/// The latest held inputs, as returned by `GET /api/v1/inputs`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputSnapshot {
    pub seq: u64,
    pub at: u64,
    #[serde(flatten)]
    pub state: InputState,
}

/// How long a `GET /api/v1/inputs` keeps the inputs being read, so a client that polls the REST
/// route gets live values without having to open a WebSocket.
const REST_INPUT_KEEPALIVE_MS: u64 = 5_000;

struct InputData {
    seq: u64,
    at: u64,
    state: InputState,
}

/// Everything at one point in time, as returned by `GET /api/v1/snapshot`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// Increments with every published change.
    pub seq: u64,
    /// Unix time in milliseconds of the last published change.
    pub updated_at: u64,
    pub status: ReaderStatus,
    pub state: GameState,
}

/// A change broadcast to WebSocket clients.
#[derive(Debug, Clone)]
pub enum Update {
    /// Full game state, serialised once for all subscribers.
    State {
        seq: u64,
        state: Arc<Value>,
    },
    Status {
        seq: u64,
        status: ReaderStatus,
    },
    Event {
        seq: u64,
        event: Arc<Event>,
    },
}

struct Data {
    seq: u64,
    updated_at: u64,
    status: ReaderStatus,
    game: GameState,
    /// JSON of `game`, built lazily so nothing is serialised while no client needs it.
    game_json: Option<Arc<Value>>,
}

struct Inner {
    started: Instant,
    published: AtomicU64,
    data: RwLock<Data>,
    settings: RwLock<ApiSettings>,
    tx: broadcast::Sender<Update>,
    input: RwLock<InputData>,
    input_tx: broadcast::Sender<InputUpdate>,
    /// Input WebSockets currently connected.
    input_sockets: AtomicUsize,
    /// Windows of the app that want the inputs, by label (`overlay`, `main`).
    input_windows: Mutex<HashSet<String>>,
    input_window_count: AtomicUsize,
    /// Until when (ms since start) a REST request keeps the inputs being read.
    input_rest_until: AtomicU64,
    /// The personal best of the current beatmap, with its samples (served at `/personal-best`).
    ghost: RwLock<Option<Arc<PersonalBestGhost>>>,
}

/// Cheap to clone; all clones share the same state.
#[derive(Clone)]
pub struct Hub(Arc<Inner>);

/// Who keeps the held inputs being read (they are only read while someone looks at them).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputConsumers {
    /// Input WebSockets connected.
    pub sockets: usize,
    /// Windows of the app that show keys (`overlay`, `main`), sorted.
    pub windows: Vec<String>,
    /// A REST client polled `/inputs` a moment ago.
    pub rest: bool,
}

/// `value` as a JSON value, with numbers written the way the REST routes write them.
///
/// `serde_json::to_value` widens an `f32` to `f64` first (`9.2` becomes `9.199999809265137`); going
/// through text keeps the shortest representation, so a WebSocket message shows the same numbers as
/// the matching REST response.
pub(crate) fn json_value<T: Serialize>(value: &T) -> Value {
    serde_json::to_string(value)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or(Value::Null)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// A poisoned lock only means a writer panicked mid-update; the data is still readable.
fn read<T>(l: &RwLock<T>) -> RwLockReadGuard<'_, T> {
    l.read().unwrap_or_else(PoisonError::into_inner)
}

fn write<T>(l: &RwLock<T>) -> RwLockWriteGuard<'_, T> {
    l.write().unwrap_or_else(PoisonError::into_inner)
}

impl Hub {
    #[must_use]
    pub fn new(settings: ApiSettings) -> Self {
        let game = GameState::default();
        let (tx, _) = broadcast::channel(CHANNEL_CAPACITY);
        let (input_tx, _) = broadcast::channel(INPUT_CHANNEL_CAPACITY);
        Self(Arc::new(Inner {
            started: Instant::now(),
            published: AtomicU64::new(0),
            data: RwLock::new(Data {
                seq: 0,
                updated_at: now_ms(),
                status: ReaderStatus::Waiting,
                game_json: None,
                game,
            }),
            settings: RwLock::new(settings),
            tx,
            input: RwLock::new(InputData {
                seq: 0,
                at: now_ms(),
                state: InputState::default(),
            }),
            input_tx,
            input_sockets: AtomicUsize::new(0),
            input_windows: Mutex::new(HashSet::new()),
            input_window_count: AtomicUsize::new(0),
            input_rest_until: AtomicU64::new(0),
            ghost: RwLock::new(None),
        }))
    }

    /// Publishes a new game state and the events that follow from the change.
    pub fn publish_state(&self, game: GameState) {
        // No subscribers is the normal case when no overlay is open: then there is nobody to
        // serialise for, and nobody to diff events for.
        let listening = self.0.tx.receiver_count() > 0;
        let (seq, events, json) = {
            let mut d = write(&self.0.data);
            let events = if listening {
                events::diff(&d.game, &game)
            } else {
                Vec::new()
            };
            let json = listening.then(|| Arc::new(json_value(&game)));
            d.seq = self.0.published.fetch_add(1, Ordering::Relaxed) + 1;
            d.updated_at = now_ms();
            d.game = game;
            d.game_json = json.clone();
            (d.seq, events, json)
        };
        if let Some(state) = json {
            let _ = self.0.tx.send(Update::State { seq, state });
        }
        for event in events {
            let _ = self.0.tx.send(Update::Event {
                seq,
                event: Arc::new(event),
            });
        }
    }

    pub fn publish_status(&self, status: ReaderStatus) {
        let seq = {
            let mut d = write(&self.0.data);
            if d.status == status {
                return;
            }
            d.seq = self.0.published.fetch_add(1, Ordering::Relaxed) + 1;
            d.updated_at = now_ms();
            d.status = status.clone();
            d.seq
        };
        let _ = self.0.tx.send(Update::Status { seq, status });
    }

    #[must_use]
    pub fn snapshot(&self) -> Snapshot {
        let d = read(&self.0.data);
        Snapshot {
            seq: d.seq,
            updated_at: d.updated_at,
            status: d.status.clone(),
            state: d.game.clone(),
        }
    }

    #[must_use]
    pub fn game(&self) -> GameState {
        read(&self.0.data).game.clone()
    }

    /// The current state as JSON together with its sequence number.
    #[must_use]
    pub fn game_json(&self) -> (u64, Arc<Value>) {
        {
            let d = read(&self.0.data);
            if let Some(json) = &d.game_json {
                return (d.seq, Arc::clone(json));
            }
        }
        let mut d = write(&self.0.data);
        if d.game_json.is_none() {
            d.game_json = Some(Arc::new(json_value(&d.game)));
        }
        let json = d.game_json.clone().unwrap_or_else(|| Arc::new(Value::Null));
        (d.seq, json)
    }

    #[must_use]
    pub fn ghost(&self) -> Option<Arc<PersonalBestGhost>> {
        read(&self.0.ghost).clone()
    }

    pub fn set_ghost(&self, ghost: Option<Arc<PersonalBestGhost>>) {
        *write(&self.0.ghost) = ghost;
    }

    #[must_use]
    pub fn status(&self) -> ReaderStatus {
        read(&self.0.data).status.clone()
    }

    #[must_use]
    pub fn settings(&self) -> ApiSettings {
        *read(&self.0.settings)
    }

    pub fn set_settings(&self, settings: ApiSettings) {
        *write(&self.0.settings) = settings;
    }

    /// Publishes the held inputs; returns `false` (and sends nothing) when they did not change.
    #[must_use = "false means nothing changed, so there is nothing to forward"]
    pub fn publish_inputs(&self, state: &InputState) -> bool {
        let update = {
            let mut d = write(&self.0.input);
            if d.state == *state {
                return false;
            }
            d.seq += 1;
            d.at = now_ms();
            d.state.clone_from(state);
            InputUpdate {
                seq: d.seq,
                at: d.at,
                state: Arc::new(state.clone()),
            }
        };
        let _ = self.0.input_tx.send(update);
        true
    }

    #[must_use]
    pub fn inputs(&self) -> InputSnapshot {
        let d = read(&self.0.input);
        InputSnapshot {
            seq: d.seq,
            at: d.at,
            state: d.state.clone(),
        }
    }

    #[must_use]
    pub fn subscribe_inputs(&self) -> broadcast::Receiver<InputUpdate> {
        self.0.input_tx.subscribe()
    }

    /// Registers an input WebSocket; the inputs are read for as long as the guard lives.
    #[must_use]
    pub fn watch_inputs(&self) -> InputWatch {
        self.0.input_sockets.fetch_add(1, Ordering::Relaxed);
        InputWatch(self.clone())
    }

    /// A window of the app (`overlay`, `main`) starts or stops needing the inputs.
    pub fn set_input_window(&self, label: &str, wanted: bool) {
        let mut windows = self
            .0
            .input_windows
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if wanted {
            windows.insert(label.to_owned());
        } else {
            windows.remove(label);
        }
        self.0
            .input_window_count
            .store(windows.len(), Ordering::Relaxed);
    }

    /// Labels of the app windows that want the inputs.
    #[must_use]
    pub fn input_windows(&self) -> Vec<String> {
        self.0
            .input_windows
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .cloned()
            .collect()
    }

    /// Keeps the inputs being read for a few more seconds (a REST client is polling them).
    pub fn touch_inputs(&self) {
        let until = self.uptime_ms() + REST_INPUT_KEEPALIVE_MS;
        self.0.input_rest_until.fetch_max(until, Ordering::Relaxed);
    }

    /// Whether anything (a WebSocket, a window, a recent REST request) is looking at the inputs.
    /// Called on every iteration of the fast loop: it only reads atomics.
    #[must_use]
    pub fn inputs_wanted(&self) -> bool {
        self.0.input_sockets.load(Ordering::Relaxed) > 0
            || self.0.input_window_count.load(Ordering::Relaxed) > 0
            || self.0.input_rest_until.load(Ordering::Relaxed) > self.uptime_ms()
    }

    /// What currently keeps the inputs being read, for diagnostics.
    #[must_use]
    pub fn input_consumers(&self) -> InputConsumers {
        let mut windows = self.input_windows();
        windows.sort();
        InputConsumers {
            sockets: self.0.input_sockets.load(Ordering::Relaxed),
            windows,
            rest: self.0.input_rest_until.load(Ordering::Relaxed) > self.uptime_ms(),
        }
    }

    /// WebSocket clients subscribed to the game state and events, for diagnostics.
    #[must_use]
    pub fn state_clients(&self) -> usize {
        self.0.tx.receiver_count()
    }

    #[must_use]
    pub fn uptime_ms(&self) -> u64 {
        self.0.started.elapsed().as_millis() as u64
    }

    #[must_use]
    pub fn subscribe(&self) -> broadcast::Receiver<Update> {
        self.0.tx.subscribe()
    }
}

/// Keeps a hub's inputs being read while an input WebSocket is connected.
pub struct InputWatch(Hub);

impl Drop for InputWatch {
    fn drop(&mut self) {
        (self.0).0.input_sockets.fetch_sub(1, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lazer_reader::model::Screen;

    fn hub() -> Hub {
        Hub::new(ApiSettings {
            poll_interval_ms: 33,
            input_poll_interval_ms: 2,
            port: 24051,
        })
    }

    #[test]
    fn publish_state_should_bump_the_sequence_and_store_the_state() {
        let hub = hub();
        let before = hub.snapshot().seq;
        hub.publish_state(GameState {
            connected: true,
            screen: Screen::Menu,
            ..GameState::default()
        });
        let snap = hub.snapshot();
        assert_eq!(snap.seq, before + 1);
        assert_eq!(snap.state.screen, Screen::Menu);
    }

    #[test]
    fn publish_state_should_broadcast_state_then_events() {
        let hub = hub();
        let mut rx = hub.subscribe();
        hub.publish_state(GameState {
            connected: true,
            screen: Screen::Menu,
            ..GameState::default()
        });
        assert!(matches!(rx.try_recv(), Ok(Update::State { .. })));
        assert!(matches!(rx.try_recv(), Ok(Update::Event { .. })));
    }

    #[test]
    fn game_json_should_write_floats_like_the_rest_routes() {
        let hub = hub();
        let beatmap = lazer_reader::model::Beatmap {
            ar: 9.2,
            ..Default::default()
        };
        hub.publish_state(GameState {
            beatmap: Some(beatmap),
            ..GameState::default()
        });
        let (_, json) = hub.game_json();
        assert_eq!(json["beatmap"]["ar"], serde_json::json!(9.2));
    }

    #[test]
    fn publish_status_should_ignore_repeated_values() {
        let hub = hub();
        let mut rx = hub.subscribe();
        hub.publish_status(ReaderStatus::Connecting);
        hub.publish_status(ReaderStatus::Connecting);
        assert!(matches!(rx.try_recv(), Ok(Update::Status { .. })));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn publish_inputs_should_only_send_changes() {
        let hub = hub();
        let mut rx = hub.subscribe_inputs();
        let held = InputState::from_codes(vec![108], vec![]);
        assert!(hub.publish_inputs(&held));
        assert!(!hub.publish_inputs(&held));
        assert!(hub.publish_inputs(&InputState::default()));
        assert_eq!(rx.try_recv().map(|u| u.seq), Ok(1));
        assert_eq!(rx.try_recv().map(|u| u.seq), Ok(2));
        assert!(rx.try_recv().is_err());
        assert_eq!(hub.inputs().seq, 2);
    }

    #[test]
    fn inputs_wanted_should_follow_sockets_windows_and_rest_polling() {
        let hub = hub();
        assert!(!hub.inputs_wanted());
        let watch = hub.watch_inputs();
        assert!(hub.inputs_wanted());
        drop(watch);
        assert!(!hub.inputs_wanted());
        hub.set_input_window("overlay", true);
        assert!(hub.inputs_wanted());
        assert_eq!(hub.input_windows(), ["overlay"]);
        hub.set_input_window("overlay", false);
        assert!(!hub.inputs_wanted());
        hub.touch_inputs();
        assert!(hub.inputs_wanted());
    }
}
