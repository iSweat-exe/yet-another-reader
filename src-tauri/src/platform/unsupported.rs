//! Stand-in for platforms without a port yet: the topmost window falls back to Tauri's own
//! setting, and the Windows-only features do nothing or report that they are unavailable.

use tauri::WebviewWindow;

pub fn keep_on_top(window: &WebviewWindow) {
    let _ = window.set_always_on_top(true);
}

pub fn fine_timer(_on: bool) {}

pub fn lower_priority() {}

pub fn write_osd(_text: &str) -> Result<(), String> {
    Err("RivaTuner (RTSS) is only available on Windows".into())
}
