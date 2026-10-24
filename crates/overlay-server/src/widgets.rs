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

/// How many files [`fingerprints`] looks at in one widget folder (a runaway `node_modules` stops here).
const MAX_FINGERPRINT_FILES: usize = 400;
const MAX_FINGERPRINT_DEPTH: usize = 4;

/// A number that changes whenever a file of the widget folder is added, removed or saved, for each
/// widget folder of `dir` (valid or not: a half-written manifest should reload the widget once fixed).
///
/// This is what lets the app reload a widget when its HTML is edited: sizes and modification times
/// are compared, nothing is read, so polling it twice a second is cheap.
pub fn fingerprints(dir: &Path) -> std::collections::BTreeMap<String, u64> {
    let mut out = std::collections::BTreeMap::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        let Some(id) = path.file_name().and_then(|n| n.to_str()).map(str::to_owned) else {
            continue;
        };
        if path.is_dir() && is_safe_segment(&id) {
            let mut hash = 0xcbf2_9ce4_8422_2325_u64;
            let mut budget = MAX_FINGERPRINT_FILES;
            fingerprint_into(&path, 0, &mut hash, &mut budget);
            out.insert(id, hash);
        }
    }
    out
}

fn fingerprint_into(dir: &Path, depth: usize, hash: &mut u64, budget: &mut usize) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = entries.filter_map(Result::ok).collect();
    entries.sort_by_key(std::fs::DirEntry::file_name);
    for entry in entries {
        if *budget == 0 {
            return;
        }
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        let name = entry.file_name();
        if meta.is_dir() {
            if depth < MAX_FINGERPRINT_DEPTH && !name.to_string_lossy().starts_with('.') {
                fingerprint_into(&path, depth + 1, hash, budget);
            }
            continue;
        }
        *budget -= 1;
        let modified = meta
            .modified()
            .ok()
            .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_nanos() as u64);
        for byte in name
            .to_string_lossy()
            .bytes()
            .chain(meta.len().to_le_bytes())
            .chain(modified.to_le_bytes())
        {
            *hash = (*hash ^ u64::from(byte)).wrapping_mul(0x100_0000_01b3);
        }
    }
}

const TEMPLATE_MANIFEST: &str =
    include_str!("../../../docs/examples/widget-template/manifest.json");
const TEMPLATE_PAGE: &str = include_str!("../../../docs/examples/widget-template/index.html");
const NAME_PLACEHOLDER: &str = "__NAME__";
const MAX_NAME_CHARS: usize = 40;

/// A folder name for a widget called `name`: lower case words joined by dashes (`my-widget`).
pub fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.trim().chars().flat_map(char::to_lowercase) {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    out.trim_end_matches('-').to_owned()
}

/// Creates a new widget folder from the template and returns its id (the folder name).
///
/// An existing folder is never touched: a taken name gets a numeric suffix.
pub fn scaffold(dir: &Path, name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME_CHARS {
        return Err("invalidName".into());
    }
    let base = slug(name);
    if base.is_empty() {
        return Err("invalidName".into());
    }
    let mut id = base.clone();
    let mut n = 2;
    while dir.join(&id).exists() {
        id = format!("{base}-{n}");
        n += 1;
    }
    let folder = dir.join(&id);
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let json_name = serde_json::to_string(name).map_err(|e| e.to_string())?;
    // `to_string` quotes the name: the template already has the quotes around its placeholder.
    let manifest = TEMPLATE_MANIFEST.replace(&format!("\"{NAME_PLACEHOLDER}\""), &json_name);
    let page = TEMPLATE_PAGE.replace(
        NAME_PLACEHOLDER,
        &name
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;"),
    );
    std::fs::write(folder.join("manifest.json"), manifest).map_err(|e| e.to_string())?;
    std::fs::write(folder.join("index.html"), page).map_err(|e| e.to_string())?;
    Ok(id)
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

    #[test]
    fn scaffold_should_create_a_widget_the_scan_accepts() {
        let dir = temp_dir("scaffold");
        let id = scaffold(&dir, "My <cool> widget").unwrap();
        assert_eq!(id, "my-cool-widget");
        let found = scan(&dir);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "My <cool> widget");
        assert_eq!(found[0].options.len(), 4);
        let page = std::fs::read_to_string(dir.join(&id).join("index.html")).unwrap();
        assert!(page.contains("<title>My &lt;cool&gt; widget</title>"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn scaffold_should_not_overwrite_an_existing_widget() {
        let dir = temp_dir("scaffold-twice");
        assert_eq!(scaffold(&dir, "Clock").unwrap(), "clock");
        assert_eq!(scaffold(&dir, "Clock").unwrap(), "clock-2");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn scaffold_should_refuse_a_name_without_letters() {
        let dir = temp_dir("scaffold-bad");
        assert_eq!(scaffold(&dir, "  ").unwrap_err(), "invalidName");
        assert_eq!(scaffold(&dir, "???").unwrap_err(), "invalidName");
        assert_eq!(scaffold(&dir, &"a".repeat(41)).unwrap_err(), "invalidName");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn slug_should_join_words_with_dashes() {
        assert_eq!(slug("  Hello,   World! "), "hello-world");
        assert_eq!(slug("../x"), "x");
    }

    #[test]
    fn fingerprints_should_change_when_a_widget_file_is_saved() {
        let dir = temp_dir("fp");
        widget(&dir, "a", r#"{ "name": "A" }"#, true);
        widget(&dir, "b", r#"{ "name": "B" }"#, true);
        let before = fingerprints(&dir);
        assert_eq!(fingerprints(&dir), before);
        std::fs::write(
            dir.join("a").join("index.html"),
            "<html>changed, longer</html>",
        )
        .unwrap();
        let after = fingerprints(&dir);
        assert_ne!(after["a"], before["a"]);
        assert_eq!(after["b"], before["b"]);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn fingerprints_should_notice_a_new_or_removed_widget() {
        let dir = temp_dir("fp-add");
        let before = fingerprints(&dir);
        widget(&dir, "new", r#"{ "name": "N" }"#, true);
        assert!(fingerprints(&dir).contains_key("new"));
        assert!(!before.contains_key("new"));
        std::fs::remove_dir_all(dir.join("new")).unwrap();
        assert!(!fingerprints(&dir).contains_key("new"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
