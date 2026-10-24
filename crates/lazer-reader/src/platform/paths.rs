//! Where osu!lazer lives on disk. Each operating system answers differently; the
//! unsupported ones return `None` until a port exists.

use std::path::PathBuf;

/// File name of the game executable, as the process table reports it.
#[must_use]
pub fn game_exe_name() -> &'static str {
    if cfg!(windows) { "osu!.exe" } else { "osu!" }
}

/// The lazer install directory (the folder that holds the game executable).
#[must_use]
pub fn lazer_install_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("LOCALAPPDATA").map(|dir| PathBuf::from(dir).join("osulazer/current"))
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// Where lazer keeps its data: `%APPDATA%\osu`, or the custom `FullPath` of `storage.ini`.
#[must_use]
pub fn storage_root() -> Option<PathBuf> {
    let default = default_data_dir()?;
    let custom = std::fs::read_to_string(default.join("storage.ini"))
        .ok()
        .and_then(|ini| {
            ini.lines().find_map(|l| {
                let (key, value) = l.split_once('=')?;
                (key.trim() == "FullPath").then(|| PathBuf::from(value.trim()))
            })
        });
    Some(custom.filter(|p| p.is_dir()).unwrap_or(default))
}

/// The data directory lazer uses when `storage.ini` does not override it.
fn default_data_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("APPDATA").map(|dir| PathBuf::from(dir).join("osu"))
    }
    #[cfg(not(windows))]
    {
        None
    }
}
