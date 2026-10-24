//! Owns the local API server and restarts it when its settings change.

use std::sync::Mutex;

use overlay_server::{Hub, RunningServer};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::diag::Diag;
use crate::settings::Settings;

pub const EVENT_API_STATUS: &str = "api-status";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ApiStatus {
    pub enabled: bool,
    pub running: bool,
    pub port: u16,
    pub url: Option<String>,
    /// Why the server could not start (port already in use, ...).
    pub error: Option<String>,
}

#[derive(Default)]
pub struct ApiSupervisor {
    server: tokio::sync::Mutex<Option<RunningServer>>,
    status: Mutex<ApiStatus>,
}

impl ApiSupervisor {
    pub fn status(&self) -> ApiStatus {
        self.status
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// Stops the current server (if any) and starts one matching `settings`.
    pub async fn apply(
        &self,
        app: &AppHandle,
        hub: &Hub,
        settings: &Settings,
        widgets_dir: &std::path::Path,
        diag: &Diag,
    ) {
        let mut server = self.server.lock().await;
        if let Some(old) = server.take() {
            old.stop().await;
        }

        let mut status = ApiStatus {
            enabled: settings.api_enabled,
            port: settings.api_port,
            ..ApiStatus::default()
        };
        if settings.api_enabled {
            match overlay_server::start_with_images(
                hub.clone(),
                settings.api_port,
                lazer_reader::pp::storage_root(),
                Some(widgets_dir.to_path_buf()),
                app.path()
                    .app_config_dir()
                    .ok()
                    .map(|dir| crate::images::dir_in(&dir)),
            )
            .await
            {
                Ok(running) => {
                    status.running = true;
                    status.url = Some(format!("http://{}", running.addr));
                    diag.info(app, "api", format!("listening on http://{}", running.addr));
                    *server = Some(running);
                }
                Err(e) => {
                    let message =
                        format!("Could not listen on 127.0.0.1:{}: {e}", settings.api_port);
                    diag.error(app, "api", message.clone());
                    status.error = Some(message);
                }
            }
        } else {
            diag.info(app, "api", "stopped (disabled in the settings)");
        }

        *self
            .status
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = status.clone();
        let _ = app.emit(EVENT_API_STATUS, &status);
    }
}
