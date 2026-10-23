//! Community widgets: folders of plain HTML/CSS/JS that an overlay layout can embed.
//!
//! A widget is a folder inside the widgets directory with a `manifest.json` and an entry
//! page (default `index.html`). The server serves the folders at `/widgets/<id>/...` and lists
//! their manifests at `GET /api/v1/widgets`. See `docs/WIDGETS.md`.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Default size (layout pixels at 1080p) when a manifest does not give one.
const FALLBACK_SIZE: Size = Size { w: 400, h: 120 };

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Size {
    pub w: u32,
    pub h: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Choice {
    pub value: Value,
    #[serde(default)]
    pub label: Option<String>,
}

/// One configurable option, shown by the editor as a form control.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetOption {
    pub key: String,
    #[serde(default)]
    pub label: Option<String>,
    /// `string`, `number`, `boolean`, `color` or `select`.
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub default: Option<Value>,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub choices: Vec<Choice>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetManifest {
    /// Folder name; filled in by the scan.
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_entry")]
    pub entry: String,
    #[serde(default = "default_size")]
    pub default_size: Size,
    #[serde(default)]
    pub options: Vec<WidgetOption>,
}

fn default_entry() -> String {
    "index.html".to_owned()
}

fn default_size() -> Size {
    FALLBACK_SIZE
}

/// A folder name that is safe to use in a URL path and cannot escape the widgets directory.
fn is_safe_segment(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ' '))
}

/// An entry page path inside the widget folder (no absolute paths, no `..`).
fn is_safe_entry(entry: &str) -> bool {
    !entry.is_empty()
        && !entry.starts_with(['/', '\\'])
        && !entry.contains(':')
        && entry
            .split(['/', '\\'])
            .all(|part| !part.is_empty() && part != "..")
}

/// Reads one widget folder; `None` if it has no valid manifest.
fn read_widget(dir: &Path) -> Option<WidgetManifest> {
    let id = dir.file_name()?.to_str()?.to_owned();
    if !is_safe_segment(&id) {
        return None;
    }
    let text = std::fs::read_to_string(dir.join("manifest.json")).ok()?;
    let mut manifest: WidgetManifest = serde_json::from_str(&text).ok()?;
    if !is_safe_entry(&manifest.entry) || !dir.join(&manifest.entry).is_file() {
        return None;
    }
    manifest.id = id;
    Some(manifest)
}

/// All valid widgets in `dir`, sorted by name.
pub fn scan(dir: &Path) -> Vec<WidgetManifest> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut widgets: Vec<_> = entries
        .filter_map(Result::ok)
        .filter(|e| e.path().is_dir())
        .filter_map(|e| read_widget(&e.path()))
        .collect();
    widgets.sort_by_key(|w| w.name.to_lowercase());
    widgets
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("yar-widgets-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn widget(dir: &Path, id: &str, manifest: &str, with_entry: bool) {
        let folder = dir.join(id);
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("manifest.json"), manifest).unwrap();
        if with_entry {
            std::fs::write(folder.join("index.html"), "<html></html>").unwrap();
        }
    }

    #[test]
    fn scan_should_list_valid_widgets_with_defaults() {
        let dir = temp_dir("ok");
        widget(&dir, "clock", r#"{ "name": "Clock" }"#, true);
        let found = scan(&dir);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, "clock");
        assert_eq!(found[0].entry, "index.html");
        assert_eq!(found[0].default_size, FALLBACK_SIZE);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn scan_should_skip_widgets_without_entry_page_or_with_bad_manifest() {
        let dir = temp_dir("bad");
        widget(&dir, "no-entry", r#"{ "name": "x" }"#, false);
        widget(&dir, "broken", "not json", true);
        widget(
            &dir,
            "escape",
            r#"{ "name": "x", "entry": "../secret.html" }"#,
            true,
        );
        assert!(scan(&dir).is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn scan_should_parse_options() {
        let dir = temp_dir("opts");
        widget(
            &dir,
            "w",
            r##"{ "name": "W", "options": [
                { "key": "color", "type": "color", "default": "#fff" },
                { "key": "mode", "type": "select", "choices": [{ "value": "a", "label": "A" }] }
            ] }"##,
            true,
        );
        let w = &scan(&dir)[0];
        assert_eq!(w.options.len(), 2);
        assert_eq!(w.options[1].choices[0].label.as_deref(), Some("A"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn is_safe_entry_should_reject_traversal_and_absolute_paths() {
        assert!(is_safe_entry("index.html"));
        assert!(is_safe_entry("pages/main.html"));
        assert!(!is_safe_entry("../x.html"));
        assert!(!is_safe_entry("/etc/passwd"));
        assert!(!is_safe_entry("C:\\x.html"));
    }

    #[test]
    fn is_safe_segment_should_reject_hidden_and_special_names() {
        assert!(is_safe_segment("my-widget_2"));
        assert!(!is_safe_segment(".git"));
        assert!(!is_safe_segment("a/b"));
        assert!(!is_safe_segment(""));
    }
}
