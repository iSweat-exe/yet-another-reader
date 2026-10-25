//! Shared application state, managed by Tauri and handed to every command.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use overlay_server::{ApiSettings, Hub};
use tauri::State;

use crate::api::ApiSupervisor;
use crate::diag::Diag;
use crate::layout;
use crate::nowplaying;
use crate::overlay::OverlayControl;
use crate::rtss::RtssControl;
use crate::settings::{self, Settings};
use crate::updater::Updater;

pub(crate) const EVENT_SETTINGS_CHANGED: &str = "settings-changed";
pub(crate) const EVENT_LAYOUT_CHANGED: &str = "layout-changed";
pub(crate) const EVENT_OVERLAY_PREVIEW: &str = "overlay-preview";

/// Shared application state, managed by Tauri.
pub(crate) struct AppContext {
    pub(crate) hub: Hub,
    pub(crate) settings: Mutex<Settings>,
    pub(crate) config_dir: PathBuf,
    pub(crate) widgets_dir: PathBuf,
    pub(crate) poll_ms: Arc<AtomicU64>,
    pub(crate) input_ms: Arc<AtomicU64>,
    pub(crate) overlay_fps: Arc<AtomicU32>,
    pub(crate) overlay: Arc<OverlayControl>,
    pub(crate) rtss: Arc<RtssControl>,
    pub(crate) now_playing: nowplaying::SharedConfig,
    pub(crate) api: ApiSupervisor,
    pub(crate) diag: Diag,
    pub(crate) updater: Updater,
}

pub(crate) type Ctx<'a> = State<'a, Arc<AppContext>>;

impl AppContext {
    pub(crate) fn settings_path(&self) -> PathBuf {
        settings::file_in(&self.config_dir)
    }

    pub(crate) fn current_settings(&self) -> Settings {
        self.settings
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    /// Tells the overlay tracker which pages the active layout draws something on.
    pub(crate) fn refresh_pages(&self, active: &str) {
        let mask = layout::load(&layout::path_for(&self.config_dir, active))
            .map_or(0, |l| layout::pages_mask(&l));
        self.overlay.pages_mask.store(mask, Ordering::Relaxed);
    }

    pub(crate) fn now_playing_config(&self, s: &Settings) -> nowplaying::NowPlayingConfig {
        nowplaying::NowPlayingConfig {
            enabled: s.now_playing_enabled,
            dir: if s.now_playing_dir.trim().is_empty() {
                self.config_dir.join("nowplaying")
            } else {
                PathBuf::from(s.now_playing_dir.trim())
            },
            template: s.now_playing_template.clone(),
        }
    }

    /// Pushes the values the background threads read.
    pub(crate) fn apply_live(&self, s: &Settings) {
        self.poll_ms.store(s.poll_interval_ms, Ordering::Relaxed);
        self.input_ms
            .store(s.input_poll_interval_ms, Ordering::Relaxed);
        self.overlay_fps.store(s.overlay_fps, Ordering::Relaxed);
        self.overlay
            .enabled
            .store(s.overlay_enabled, Ordering::Relaxed);
        self.overlay
            .only_when_focused
            .store(s.overlay_only_when_focused, Ordering::Relaxed);
        self.rtss.enabled.store(s.rtss_enabled, Ordering::Relaxed);
        self.rtss.x.store(s.rtss_x, Ordering::Relaxed);
        self.rtss.y.store(s.rtss_y, Ordering::Relaxed);
        self.hub.set_settings(api_settings(s));
        *self
            .now_playing
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = self.now_playing_config(s);
    }
}

pub(crate) fn api_settings(s: &Settings) -> ApiSettings {
    ApiSettings {
        poll_interval_ms: s.poll_interval_ms,
        input_poll_interval_ms: s.input_poll_interval_ms,
        port: s.api_port,
    }
}
