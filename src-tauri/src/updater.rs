//! Automatic updates, through the Tauri updater plugin.
//!
//! A release publishes a signed installer and a `latest.json` next to it (see `.github/workflows/release.yml`).
//! The app downloads that file from the endpoint set in `tauri.conf.json`, compares versions, and only
//! installs an update whose signature matches the public key embedded in the app: a hijacked download
//! location cannot push code. Nothing is installed without the user asking for it.

use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::context::AppContext;

/// Sent to the interface every time the status changes.
pub(crate) const EVENT_UPDATE_STATUS: &str = "update-status";
/// The reader gets the game connection first: the first look for an update waits a little.
const FIRST_CHECK_DELAY: Duration = Duration::from_secs(20);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
/// Minimum change of the download percentage between two progress events.
const PROGRESS_STEP: u64 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "phase",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum UpdateStatus {
    /// Nothing known yet (or the last silent check failed).
    Idle,
    Checking,
    UpToDate,
    Available {
        version: String,
        current: String,
        notes: Option<String>,
        date: Option<String>,
    },
    Downloading {
        downloaded: u64,
        total: Option<u64>,
    },
    /// Downloaded and verified; the installer is taking over.
    Installing,
    Error {
        message: String,
    },
}

/// The status, and the update found by the last check (kept to install it without asking the server again).
#[derive(Default)]
pub(crate) struct Updater {
    status: Mutex<Option<UpdateStatus>>,
    pending: Mutex<Option<Update>>,
}

impl Updater {
    pub(crate) fn status(&self) -> UpdateStatus {
        self.status
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
            .unwrap_or(UpdateStatus::Idle)
    }

    fn set(&self, app: &AppHandle, status: UpdateStatus) {
        *self.status.lock().unwrap_or_else(PoisonError::into_inner) = Some(status.clone());
        let _ = app.emit(EVENT_UPDATE_STATUS, status);
    }
}

fn context(app: &AppHandle) -> std::sync::Arc<AppContext> {
    std::sync::Arc::clone(&app.state::<std::sync::Arc<AppContext>>())
}

/// Asks the update server whether a newer version exists. `manual` checks report their failures to the
/// user; the background ones stay quiet (the journal keeps the reason) so a missing network never nags.
pub(crate) async fn check(app: &AppHandle, manual: bool) -> UpdateStatus {
    let ctx = context(app);
    let state = &ctx.updater;
    state.set(app, UpdateStatus::Checking);

    let result = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    let status = match result {
        Ok(Some(update)) => {
            let status = UpdateStatus::Available {
                version: update.version.clone(),
                current: update.current_version.clone(),
                notes: update.body.clone(),
                date: update.date.map(|d| d.to_string()),
            };
            ctx.diag.info(
                app,
                "updates",
                format!(
                    "version {} is available (running {})",
                    update.version, update.current_version
                ),
            );
            *state.pending.lock().unwrap_or_else(PoisonError::into_inner) = Some(update);
            status
        }
        Ok(None) => {
            *state.pending.lock().unwrap_or_else(PoisonError::into_inner) = None;
            UpdateStatus::UpToDate
        }
        Err(error) => {
            ctx.diag
                .warn(app, "updates", format!("update check failed: {error}"));
            if manual {
                UpdateStatus::Error {
                    message: error.to_string(),
                }
            } else {
                UpdateStatus::Idle
            }
        }
    };
    state.set(app, status.clone());
    status
}

/// Downloads the update found by the last check, verifies its signature, then installs it and restarts.
pub(crate) async fn install(app: &AppHandle) -> Result<(), String> {
    let ctx = context(app);
    let state = &ctx.updater;
    let update = state
        .pending
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .take()
        .ok_or_else(|| "No update to install: check for updates first.".to_owned())?;

    ctx.diag.info(
        app,
        "updates",
        format!("downloading version {}", update.version),
    );
    state.set(
        app,
        UpdateStatus::Downloading {
            downloaded: 0,
            total: None,
        },
    );

    let mut downloaded: u64 = 0;
    let mut last_percent: u64 = 0;
    let outcome = update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                let percent = total.map_or(0, |t| downloaded * 100 / t.max(1));
                if percent >= last_percent + PROGRESS_STEP || total.is_none() {
                    last_percent = percent;
                    state.set(app, UpdateStatus::Downloading { downloaded, total });
                }
            },
            || state.set(app, UpdateStatus::Installing),
        )
        .await;

    match outcome {
        Ok(()) => {
            ctx.diag.info(app, "updates", "installed, restarting");
            app.restart()
        }
        Err(error) => {
            ctx.diag
                .error(app, "updates", format!("update failed: {error}"));
            // The update can be tried again: it is put back.
            *state.pending.lock().unwrap_or_else(PoisonError::into_inner) = Some(update);
            let message = error.to_string();
            state.set(
                app,
                UpdateStatus::Error {
                    message: message.clone(),
                },
            );
            Err(message)
        }
    }
}

/// Background loop: one check shortly after startup, then every few hours, as long as the setting is on.
pub(crate) fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK_DELAY).await;
        loop {
            if context(&app).current_settings().auto_update_check {
                check(&app, false).await;
            }
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_should_serialize_with_a_phase_tag_and_camel_case_fields() {
        let json = serde_json::to_value(UpdateStatus::Available {
            version: "1.2.0".into(),
            current: "1.1.0".into(),
            notes: None,
            date: None,
        })
        .unwrap();
        assert_eq!(json["phase"], "available");
        assert_eq!(json["version"], "1.2.0");
        assert_eq!(json["current"], "1.1.0");
    }

    #[test]
    fn status_should_start_idle() {
        assert_eq!(Updater::default().status(), UpdateStatus::Idle);
    }
}
