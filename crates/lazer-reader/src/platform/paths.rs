//! Where osu!lazer lives on disk. Each operating system answers differently; the
//! unsupported ones return `None` until a port exists.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// The executable of the build being read, once one is attached: it tells which data directory
/// is in use (an installed build and a development build keep theirs apart).
static RUNNING_EXE: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Remembers which executable is being read, so [`storage_root`] follows that build.
pub fn set_running_exe(exe: &Path) {
    if let Ok(mut slot) = RUNNING_EXE.lock() {
        *slot = Some(exe.to_owned());
    }
}

/// File name of the game executable, as the process table reports it.
#[must_use]
pub fn game_exe_name() -> &'static str {
    if cfg!(windows) { "osu!.exe" } else { "osu!" }
}

/// Folders that may hold an installed build (the one with the game executable), newest layout first.
/// The official installer puts both the `lazer` and the `tachyon` streams in `osulazer/current`;
/// the list also covers a portable copy next to `YAR_GAME_DIR`.
#[must_use]
pub fn install_dirs() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(dir) = std::env::var_os("YAR_GAME_DIR") {
        out.push(PathBuf::from(dir));
    }
    #[cfg(windows)]
    if let Some(dir) = std::env::var_os("LOCALAPPDATA") {
        out.push(PathBuf::from(dir).join("osulazer/current"));
    }
    out
}

/// The lazer install directory (the folder that holds the game executable).
#[must_use]
pub fn lazer_install_dir() -> Option<PathBuf> {
    let dirs = install_dirs();
    dirs.iter()
        .find(|d| d.join(game_exe_name()).is_file())
        .or_else(|| dirs.first())
        .cloned()
}

/// Where lazer keeps its data: `%APPDATA%\osu` (or `osu-development` for a development build), or
/// the custom `FullPath` of `storage.ini`. With a build attached its own directory is used; before
/// that, of the two the one whose database was written last wins.
#[must_use]
pub fn storage_root() -> Option<PathBuf> {
    let base = appdata_dir()?;
    let candidates = ["osu", "osu-development"]
        .iter()
        .map(|name| base.join(name))
        .filter(|d| d.is_dir());
    let running = RUNNING_EXE.lock().ok().and_then(|slot| slot.clone());
    let default = match running {
        // Installed builds (lazer, tachyon) use `osu`; anything else is a build from source.
        Some(exe) => {
            let installed = exe.to_string_lossy().to_lowercase().contains("osulazer");
            let dir = base.join(if installed { "osu" } else { "osu-development" });
            if dir.is_dir() { dir } else { base.join("osu") }
        }
        None => candidates
            .max_by_key(|d| last_database_write(d))
            .unwrap_or_else(|| base.join("osu")),
    };
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

/// Modification time of the newest `client_*.realm` in a data directory.
fn last_database_write(dir: &std::path::Path) -> Option<std::time::SystemTime> {
    std::fs::read_dir(dir)
        .ok()?
        .filter_map(std::result::Result::ok)
        .filter(|e| {
            let name = e.file_name();
            let name = name.to_string_lossy();
            name.starts_with("client_") && name.ends_with(".realm")
        })
        .filter_map(|e| e.metadata().ok()?.modified().ok())
        .max()
}

/// The folder that holds every build's data directory.
fn appdata_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("APPDATA").map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        None
    }
}
