//! Hot reload of community widgets: tells the windows when a widget folder changed on disk.
//!
//! The widgets folder is polled (sizes and modification times only, see `overlay_server::widgets::fingerprints`)
//! rather than watched through the OS: a handful of `stat` calls twice a second costs nothing and works the same
//! on every file system, including the network drives and synced folders people keep their widgets on.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use overlay_server::widgets::fingerprints;
use tauri::{AppHandle, Emitter};

pub const EVENT_WIDGETS_CHANGED: &str = "widgets-changed";
const INTERVAL: Duration = Duration::from_millis(500);

/// The ids of the widgets that were added, removed or modified between two scans.
pub fn changed(before: &BTreeMap<String, u64>, after: &BTreeMap<String, u64>) -> Vec<String> {
    let mut out: Vec<String> = after
        .iter()
        .filter(|(id, hash)| before.get(*id) != Some(hash))
        .map(|(id, _)| id.clone())
        .collect();
    out.extend(before.keys().filter(|id| !after.contains_key(*id)).cloned());
    out
}

pub fn spawn(app: AppHandle, dir: PathBuf) -> std::io::Result<()> {
    thread::Builder::new()
        .name("widget-watch".into())
        .spawn(move || {
            let mut known = fingerprints(&dir);
            loop {
                thread::sleep(INTERVAL);
                let now = fingerprints(&dir);
                let ids = changed(&known, &now);
                if !ids.is_empty() {
                    let _ = app.emit(EVENT_WIDGETS_CHANGED, &ids);
                    known = now;
                }
            }
        })
        .map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map(entries: &[(&str, u64)]) -> BTreeMap<String, u64> {
        entries.iter().map(|(k, v)| ((*k).to_owned(), *v)).collect()
    }

    #[test]
    fn changed_should_list_modified_added_and_removed_widgets() {
        let before = map(&[("a", 1), ("b", 2), ("gone", 3)]);
        let after = map(&[("a", 1), ("b", 9), ("new", 4)]);
        let mut ids = changed(&before, &after);
        ids.sort();
        assert_eq!(ids, ["b", "gone", "new"]);
    }

    #[test]
    fn changed_should_be_empty_when_nothing_moved() {
        let same = map(&[("a", 1)]);
        assert!(changed(&same, &same).is_empty());
    }
}
