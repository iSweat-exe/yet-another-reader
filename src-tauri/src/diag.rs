//! What the application is doing, made visible: counters of the reader loop and a short journal.
//!
//! The Status page shows both. The journal is a ring buffer, so a window opened late still sees
//! what happened before; new lines and the counters (once a second) reach the window as events.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use overlay_server::InputConsumers;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const EVENT_DIAG: &str = "reader-diag";
pub const EVENT_LOG: &str = "debug-log";
/// Lines kept for windows that open late.
const LOG_CAPACITY: usize = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Info,
    Warn,
    Error,
}

/// One line of the journal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    /// Milliseconds since the Unix epoch.
    pub at_ms: u64,
    pub level: Level,
    /// Which part of the app wrote it (`reader`, `api`, `settings`…).
    pub source: &'static str,
    pub text: String,
}

/// Counters of the reader loop over the last second, and totals since the app started.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderDiag {
    /// Game-state snapshots taken per second, and the poll rate asked for in the settings.
    pub snapshots_per_sec: f64,
    pub target_snapshots_per_sec: f64,
    /// Average and worst duration of a snapshot over the last second.
    pub snapshot_ms: f64,
    pub snapshot_max_ms: f64,
    pub snapshots_ok: u64,
    pub snapshots_failed: u64,
    /// Whether the held keys are being read, how often, and for whom.
    pub inputs_reading: bool,
    pub input_reads_per_sec: f64,
    pub input_read_us: f64,
    pub input_consumers: InputConsumers,
    /// WebSocket clients subscribed to the state and the events.
    pub state_clients: usize,
    /// Times the reader attached to the game since the app started, and how long this one lasts.
    pub sessions: u32,
    pub session_ms: u64,
    /// The last reason a read failed, if any.
    pub last_error: Option<String>,
}

/// Cheap to clone; all clones share the same journal and counters.
#[derive(Clone, Default)]
pub struct Diag(Arc<Inner>);

#[derive(Default)]
struct Inner {
    log: Mutex<VecDeque<LogLine>>,
    metrics: Mutex<ReaderDiag>,
}

/// What a window asks for when it opens.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagSnapshot {
    pub metrics: ReaderDiag,
    pub log: Vec<LogLine>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

impl Diag {
    /// Adds a line to the journal and sends it to the windows.
    pub fn log(
        &self,
        app: &AppHandle,
        level: Level,
        source: &'static str,
        text: impl Into<String>,
    ) {
        let line = LogLine {
            at_ms: now_ms(),
            level,
            source,
            text: text.into(),
        };
        {
            let mut log = self.0.log.lock().unwrap_or_else(PoisonError::into_inner);
            if log.len() == LOG_CAPACITY {
                log.pop_front();
            }
            log.push_back(line.clone());
        }
        let _ = app.emit(EVENT_LOG, &line);
    }

    pub fn info(&self, app: &AppHandle, source: &'static str, text: impl Into<String>) {
        self.log(app, Level::Info, source, text);
    }

    pub fn warn(&self, app: &AppHandle, source: &'static str, text: impl Into<String>) {
        self.log(app, Level::Warn, source, text);
    }

    pub fn error(&self, app: &AppHandle, source: &'static str, text: impl Into<String>) {
        self.log(app, Level::Error, source, text);
    }

    /// Stores the latest counters and sends them to the windows.
    pub fn set_metrics(&self, app: &AppHandle, metrics: ReaderDiag) {
        *self
            .0
            .metrics
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = metrics.clone();
        let _ = app.emit(EVENT_DIAG, &metrics);
    }

    pub fn snapshot(&self) -> DiagSnapshot {
        DiagSnapshot {
            metrics: self
                .0
                .metrics
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .clone(),
            log: self
                .0
                .log
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .iter()
                .cloned()
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_should_start_empty() {
        let diag = Diag::default();
        let snap = diag.snapshot();
        assert!(snap.log.is_empty());
        assert_eq!(snap.metrics, ReaderDiag::default());
    }
}
