//! Overlay layouts: JSON documents describing which widgets are shown and where.
//!
//! The backend does not interpret widgets; it only validates the envelope and persists it,
//! so the layout format can evolve in the frontend without Rust changes.

use std::path::{Path, PathBuf};

use serde_json::Value;

pub const DEFAULT_NAME: &str = "default";
const MAX_NAME_LEN: usize = 40;

/// Layout names become file names: letters, digits, spaces, `-` and `_` only.
pub fn is_valid_name(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty()
        && trimmed == name
        && name.chars().count() <= MAX_NAME_LEN
        && name
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_'))
}

/// Rejects documents that are clearly not a layout.
pub fn validate(layout: &Value) -> Result<(), String> {
    let obj = layout
        .as_object()
        .ok_or("A layout must be a JSON object.")?;
    if !obj.get("version").is_some_and(Value::is_number) {
        return Err("A layout needs a numeric \"version\".".into());
    }
    if !obj.get("widgets").is_some_and(Value::is_array) {
        return Err("A layout needs a \"widgets\" array.".into());
    }
    Ok(())
}

/// Pages of the game a widget can be drawn on, in bit order of [`pages_mask`].
/// Must match `PAGES` in `src/overlay/pages.ts`.
pub const PAGES: [&str; 6] = [
    "playing",
    "paused",
    "break",
    "songSelect",
    "results",
    "menu",
];

/// Bit of a page in the mask, or `None` for an unknown name.
pub fn page_bit(name: &str) -> Option<u8> {
    PAGES.iter().position(|p| *p == name).map(|i| 1 << i)
}

/// The pages at least one widget is drawn on, as a bit mask. The overlay window is only put on
/// screen while the game is on one of them. Layouts saved before pages existed use
/// `visibleWhen`: `"always"` meant every page, anything else a play.
pub fn pages_mask(layout: &Value) -> u8 {
    const PLAY: u8 = 0b111;
    const ALL: u8 = 0b11_1111;
    layout
        .get("widgets")
        .and_then(Value::as_array)
        .map_or(0, |widgets| {
            widgets.iter().fold(0, |mask, w| {
                mask | match w.get("pages").and_then(Value::as_array) {
                    Some(pages) => pages
                        .iter()
                        .filter_map(Value::as_str)
                        .filter_map(page_bit)
                        .fold(0, |m, b| m | b),
                    None if w.get("visibleWhen").and_then(Value::as_str) == Some("always") => ALL,
                    None => PLAY,
                }
            })
        })
}

pub fn path_for(config_dir: &Path, name: &str) -> PathBuf {
    config_dir.join("overlays").join(format!("{name}.json"))
}

/// Names of the saved layouts, sorted.
pub fn list(config_dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(config_dir.join("overlays")) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter_map(|e| {
            let path = e.path();
            (path.extension()? == "json").then(|| path.file_stem()?.to_str().map(str::to_owned))?
        })
        .filter(|n| is_valid_name(n))
        .collect();
    names.sort_by_key(|n| n.to_lowercase());
    names
}

pub fn delete(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

pub fn load(path: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text)
        .ok()
        .filter(|v| validate(v).is_ok())
}

pub fn save(path: &Path, layout: &Value) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(path, serde_json::to_string_pretty(layout)?)
}

// --- History --------------------------------------------------------------------------------
//
// The editor saves a moment after every change, which overwrites the file each time. So that a bad hour of edits
// is not final, a saved layout also keeps older versions: before the file is overwritten, what it held is copied
// into `overlays/.history/<name>/<unix ms>.json`, at most once every `HISTORY_EVERY_MS`, and only the newest
// `HISTORY_KEEP` are kept. A version is the layout as it was *before* a burst of edits.

/// A new version is only made when the newest one is at least this old.
pub const HISTORY_EVERY_MS: u64 = 120_000;
/// How many versions of a layout are kept.
pub const HISTORY_KEEP: usize = 40;

/// One saved version of a layout.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    /// When the layout was in that state, as milliseconds since the Unix epoch (also its file name).
    pub id: u64,
    /// Number of widgets it held, to tell versions apart at a glance.
    pub widgets: usize,
    pub bytes: u64,
}

pub fn history_dir(config_dir: &Path, name: &str) -> PathBuf {
    config_dir.join("overlays").join(".history").join(name)
}

fn version_path(config_dir: &Path, name: &str, id: u64) -> PathBuf {
    history_dir(config_dir, name).join(format!("{id}.json"))
}

/// The versions of a layout, newest first.
pub fn versions(config_dir: &Path, name: &str) -> Vec<Version> {
    let Ok(entries) = std::fs::read_dir(history_dir(config_dir, name)) else {
        return Vec::new();
    };
    let mut found: Vec<Version> = entries
        .filter_map(Result::ok)
        .filter_map(|e| {
            let path = e.path();
            let id = path.file_stem()?.to_str()?.parse::<u64>().ok()?;
            (path.extension()? == "json").then_some(())?;
            let bytes = e.metadata().ok()?.len();
            let widgets = load(&path)?
                .get("widgets")
                .and_then(Value::as_array)
                .map_or(0, Vec::len);
            Some(Version { id, widgets, bytes })
        })
        .collect();
    found.sort_by_key(|v| std::cmp::Reverse(v.id));
    found
}

/// A saved version of a layout.
pub fn load_version(config_dir: &Path, name: &str, id: u64) -> Option<Value> {
    load(&version_path(config_dir, name, id))
}

/// Keeps `previous` (what the layout held before it is overwritten) as a version, unless the newest version is
/// younger than `HISTORY_EVERY_MS` or already holds exactly this. Returns whether a version was made.
pub fn record_version(
    config_dir: &Path,
    name: &str,
    previous: &Value,
    now_ms: u64,
) -> std::io::Result<bool> {
    let newest = versions(config_dir, name).into_iter().next();
    if let Some(v) = &newest {
        if now_ms.saturating_sub(v.id) < HISTORY_EVERY_MS {
            return Ok(false);
        }
        if load_version(config_dir, name, v.id).as_ref() == Some(previous) {
            return Ok(false);
        }
    }
    let path = version_path(config_dir, name, now_ms);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(&path, serde_json::to_string(previous)?)?;
    for old in versions(config_dir, name).into_iter().skip(HISTORY_KEEP) {
        let _ = std::fs::remove_file(version_path(config_dir, name, old.id));
    }
    Ok(true)
}

/// Removes every version of a layout (when the layout itself is deleted).
pub fn delete_history(config_dir: &Path, name: &str) {
    let _ = std::fs::remove_dir_all(history_dir(config_dir, name));
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validate_should_accept_a_minimal_layout() {
        assert!(validate(&json!({ "version": 1, "widgets": [] })).is_ok());
    }

    #[test]
    fn validate_should_reject_missing_fields() {
        assert!(validate(&json!({ "widgets": [] })).is_err());
        assert!(validate(&json!({ "version": 1 })).is_err());
        assert!(validate(&json!([1, 2])).is_err());
    }

    #[test]
    fn pages_mask_should_combine_the_pages_of_every_widget() {
        let layout = json!({ "version": 3, "widgets": [{ "pages": ["playing"] }, { "pages": ["results", "nope"] }] });
        assert_eq!(pages_mask(&layout), 0b01_0001);
    }

    #[test]
    fn pages_mask_should_read_the_old_visible_when() {
        let play =
            json!({ "version": 2, "widgets": [{ "visibleWhen": "playing" }, { "id": "x" }] });
        let always = json!({ "version": 2, "widgets": [{ "visibleWhen": "always" }] });
        assert_eq!(pages_mask(&play), 0b111);
        assert_eq!(pages_mask(&always), 0b11_1111);
    }

    #[test]
    fn pages_mask_should_be_empty_without_widgets() {
        assert_eq!(pages_mask(&json!({ "version": 2, "widgets": [] })), 0);
    }

    #[test]
    fn is_valid_name_should_accept_plain_names_only() {
        assert!(is_valid_name("default"));
        assert!(is_valid_name("Mon layout 2"));
        assert!(!is_valid_name(""));
        assert!(!is_valid_name(" lead"));
        assert!(!is_valid_name("a/b"));
        assert!(!is_valid_name("..\\x"));
        assert!(!is_valid_name(&"a".repeat(41)));
    }

    #[test]
    fn list_and_delete_should_manage_saved_layouts() {
        let dir = std::env::temp_dir().join(format!("yar-layouts-list-{}", std::process::id()));
        let layout = json!({ "version": 2, "widgets": [] });
        save(&path_for(&dir, "b"), &layout).unwrap();
        save(&path_for(&dir, "A"), &layout).unwrap();
        assert_eq!(list(&dir), vec!["A".to_owned(), "b".to_owned()]);
        delete(&path_for(&dir, "A")).unwrap();
        delete(&path_for(&dir, "missing")).unwrap();
        assert_eq!(list(&dir), vec!["b".to_owned()]);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn save_then_load_should_round_trip() {
        let dir = std::env::temp_dir().join(format!("yar-layout-test-{}", std::process::id()));
        let path = path_for(&dir, "t");
        let layout = json!({ "version": 1, "widgets": [{ "id": "a" }] });
        save(&path, &layout).unwrap();
        assert_eq!(load(&path), Some(layout));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn record_version_should_keep_what_was_there_before_and_not_flood() {
        let dir = std::env::temp_dir().join(format!("yar-history-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let one = json!({ "version": 2, "widgets": [{ "id": "a" }] });
        let two = json!({ "version": 2, "widgets": [{ "id": "a" }, { "id": "b" }] });
        assert!(record_version(&dir, "t", &one, 1_000_000).unwrap());
        // Too soon after the last version: nothing new.
        assert!(!record_version(&dir, "t", &two, 1_000_000 + HISTORY_EVERY_MS - 1).unwrap());
        // Late enough, but the same content as the newest version: nothing new either.
        assert!(!record_version(&dir, "t", &one, 1_000_000 + HISTORY_EVERY_MS).unwrap());
        assert!(record_version(&dir, "t", &two, 1_000_000 + HISTORY_EVERY_MS).unwrap());
        let list = versions(&dir, "t");
        assert_eq!(
            list.iter().map(|v| v.widgets).collect::<Vec<_>>(),
            vec![2, 1]
        );
        assert_eq!(list[0].id, 1_000_000 + HISTORY_EVERY_MS);
        assert_eq!(load_version(&dir, "t", 1_000_000), Some(one));
        delete_history(&dir, "t");
        assert!(versions(&dir, "t").is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn record_version_should_keep_only_the_newest_versions() {
        let dir = std::env::temp_dir().join(format!("yar-history-cap-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        for i in 0..(HISTORY_KEEP as u64 + 5) {
            let layout = json!({ "version": 2, "widgets": [{ "id": i }] });
            record_version(&dir, "t", &layout, 1_000 + i * HISTORY_EVERY_MS).unwrap();
        }
        let list = versions(&dir, "t");
        assert_eq!(list.len(), HISTORY_KEEP);
        assert_eq!(
            list[0].id,
            1_000 + (HISTORY_KEEP as u64 + 4) * HISTORY_EVERY_MS
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn list_should_not_mistake_the_history_for_layouts() {
        let dir = std::env::temp_dir().join(format!("yar-history-list-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let layout = json!({ "version": 2, "widgets": [] });
        save(&path_for(&dir, "a"), &layout).unwrap();
        record_version(&dir, "a", &layout, 5).unwrap();
        assert_eq!(list(&dir), vec!["a".to_owned()]);
        let _ = std::fs::remove_dir_all(dir);
    }
}
