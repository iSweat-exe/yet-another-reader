//! User settings, persisted as JSON in the app config directory.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const MIN_POLL_MS: u64 = 8;
pub const MAX_POLL_MS: u64 = 5000;
pub const MIN_PORT: u16 = 1024;
pub const MAX_RTSS_COORD: u32 = 8000;
/// The held keys are sampled much faster than the rest, so the overlay of keys is real time.
pub const INPUT_POLL_RANGE: std::ops::RangeInclusive<u64> = 1..=100;
pub const FPS_RANGE: std::ops::RangeInclusive<u32> = 5..=144;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// How often the game memory is sampled, in milliseconds.
    pub poll_interval_ms: u64,
    /// How often the held keys and mouse buttons are sampled, in milliseconds.
    pub input_poll_interval_ms: u64,
    /// Whether the local HTTP/WebSocket API is served.
    pub api_enabled: bool,
    /// Port of the local API (bound to 127.0.0.1 only).
    pub api_port: u16,
    /// Whether the in-game overlay window is shown.
    pub overlay_enabled: bool,
    /// Hide the overlay while another window than the game has focus.
    pub overlay_only_when_focused: bool,
    /// Refresh rate of the overlay window, in updates per second.
    pub overlay_fps: u32,
    /// Name of the layout the overlay shows.
    pub active_layout: String,
    /// `auto` (system language), `fr` or `en`.
    pub language: String,
    /// Show the stats through RivaTuner (RTSS), which can draw over exclusive-fullscreen games.
    pub rtss_enabled: bool,
    /// Top-left corner of the RTSS text, in screen pixels.
    pub rtss_x: u32,
    pub rtss_y: u32,
    /// Look for a new version in the background (at startup, then every few hours).
    pub auto_update_check: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            poll_interval_ms: 33,
            input_poll_interval_ms: 2,
            api_enabled: true,
            api_port: 24051,
            overlay_enabled: true,
            overlay_only_when_focused: true,
            overlay_fps: 30,
            active_layout: crate::layout::DEFAULT_NAME.to_owned(),
            language: "auto".to_owned(),
            rtss_enabled: false,
            rtss_x: 40,
            rtss_y: 40,
            auto_update_check: true,
        }
    }
}

impl Settings {
    /// What differs from `previous`, one short phrase per setting (for the journal).
    pub fn changes_from(&self, previous: &Settings) -> Vec<String> {
        let mut out = Vec::new();
        macro_rules! diff {
            ($($field:ident),+ $(,)?) => {$(
                if self.$field != previous.$field {
                    out.push(format!(
                        "{}: {:?} -> {:?}",
                        stringify!($field),
                        previous.$field,
                        self.$field
                    ));
                }
            )+};
        }
        diff!(
            poll_interval_ms,
            input_poll_interval_ms,
            api_enabled,
            api_port,
            overlay_enabled,
            overlay_only_when_focused,
            overlay_fps,
            active_layout,
            language,
            rtss_enabled,
            rtss_x,
            rtss_y,
            auto_update_check,
        );
        out
    }

    /// Rejects values the app cannot honour, with a message meant for the user.
    pub fn validate(&self) -> Result<(), String> {
        if !(MIN_POLL_MS..=MAX_POLL_MS).contains(&self.poll_interval_ms) {
            return Err(format!(
                "Polling interval must be between {MIN_POLL_MS} and {MAX_POLL_MS} ms."
            ));
        }
        if !INPUT_POLL_RANGE.contains(&self.input_poll_interval_ms) {
            return Err(format!(
                "Input sampling interval must be between {} and {} ms.",
                INPUT_POLL_RANGE.start(),
                INPUT_POLL_RANGE.end()
            ));
        }
        if self.api_port < MIN_PORT {
            return Err(format!("API port must be {MIN_PORT} or higher."));
        }
        if !crate::layout::is_valid_name(&self.active_layout) {
            return Err("Invalid layout name.".into());
        }
        if !matches!(self.language.as_str(), "auto" | "fr" | "en") {
            return Err("Language must be auto, fr or en.".into());
        }
        if !FPS_RANGE.contains(&self.overlay_fps) {
            return Err(format!(
                "Overlay refresh rate must be between {} and {} fps.",
                FPS_RANGE.start(),
                FPS_RANGE.end()
            ));
        }
        if self.rtss_x > MAX_RTSS_COORD || self.rtss_y > MAX_RTSS_COORD {
            return Err(format!(
                "RTSS position must be between 0 and {MAX_RTSS_COORD} px."
            ));
        }
        Ok(())
    }

    /// Loads the settings, falling back to defaults for a missing or invalid file.
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str::<Self>(&text).ok())
            .filter(|s| s.validate().is_ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::write(path, serde_json::to_string_pretty(self)?)
    }
}

pub fn file_in(config_dir: &Path) -> PathBuf {
    config_dir.join("settings.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_should_accept_the_defaults() {
        assert!(Settings::default().validate().is_ok());
    }

    #[test]
    fn validate_should_reject_out_of_range_input_sampling() {
        let too_fast = Settings {
            input_poll_interval_ms: 0,
            ..Settings::default()
        };
        let too_slow = Settings {
            input_poll_interval_ms: 101,
            ..Settings::default()
        };
        assert!(too_fast.validate().is_err() && too_slow.validate().is_err());
    }

    #[test]
    fn load_should_fill_in_the_input_interval_of_older_files() {
        let old = r#"{ "pollIntervalMs": 50 }"#;
        let settings: Settings = serde_json::from_str(old).unwrap();
        assert_eq!(settings.input_poll_interval_ms, 2);
    }

    #[test]
    fn validate_should_reject_out_of_range_polling() {
        let fast = Settings {
            poll_interval_ms: 1,
            ..Settings::default()
        };
        let slow = Settings {
            poll_interval_ms: MAX_POLL_MS + 1,
            ..Settings::default()
        };
        assert!(fast.validate().is_err() && slow.validate().is_err());
    }

    #[test]
    fn validate_should_reject_privileged_ports() {
        assert!(
            Settings {
                api_port: 80,
                ..Settings::default()
            }
            .validate()
            .is_err()
        );
    }

    #[test]
    fn deserialize_should_fill_missing_fields_with_defaults() {
        let s: Settings = serde_json::from_str(r#"{"pollIntervalMs": 50}"#).unwrap();
        assert_eq!(s.poll_interval_ms, 50);
        assert_eq!(s.api_port, 24051);
    }
}
