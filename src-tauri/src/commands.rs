//! The commands the frontend can invoke (`invoke("name", ...)`).

use std::sync::Arc;
use std::sync::PoisonError;
use std::sync::atomic::Ordering;

use lazer_reader::model::{GameState, ReaderStatus};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::api::ApiStatus;
use crate::context::{Ctx, EVENT_LAYOUT_CHANGED, EVENT_OVERLAY_PREVIEW, EVENT_SETTINGS_CHANGED};
use crate::diag::DiagSnapshot;
use crate::layout;
use crate::rtss::RtssStatus;
use crate::settings::Settings;
use crate::updater::{self, UpdateStatus};

#[tauri::command]
pub fn get_game_state(ctx: Ctx<'_>) -> GameState {
    ctx.hub.game()
}

#[tauri::command]
pub fn get_reader_status(ctx: Ctx<'_>) -> ReaderStatus {
    ctx.hub.status()
}

#[tauri::command]
pub fn get_settings(ctx: Ctx<'_>) -> Settings {
    ctx.current_settings()
}

/// Shows fake gameplay in the overlay for a few seconds, to check its placement over the game.
#[tauri::command]
pub fn preview_overlay(app: AppHandle, ctx: Ctx<'_>) {
    const PREVIEW: std::time::Duration = std::time::Duration::from_secs(8);
    let control = Arc::clone(&ctx.overlay);
    if control.force_visible.swap(true, Ordering::Relaxed) {
        return; // a preview is already running
    }
    let _ = app.emit(EVENT_OVERLAY_PREVIEW, true);
    std::thread::spawn(move || {
        std::thread::sleep(PREVIEW);
        control.force_visible.store(false, Ordering::Relaxed);
        let _ = app.emit(EVENT_OVERLAY_PREVIEW, false);
    });
}

#[tauri::command]
pub fn get_rtss_status(ctx: Ctx<'_>) -> RtssStatus {
    ctx.rtss
        .status
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clone()
}

#[tauri::command]
pub fn get_api_status(ctx: Ctx<'_>) -> ApiStatus {
    ctx.api.status()
}

/// The reader's counters and the journal shown on the Status page.
#[tauri::command]
pub fn get_diag(ctx: Ctx<'_>) -> DiagSnapshot {
    ctx.diag.snapshot()
}

/// Validates, persists and applies new settings; returns the settings now in effect.
#[tauri::command]
pub async fn set_settings(app: AppHandle, ctx: Ctx<'_>, new: Settings) -> Result<Settings, String> {
    new.validate()?;
    let previous = std::mem::replace(
        &mut *ctx.settings.lock().unwrap_or_else(PoisonError::into_inner),
        new.clone(),
    );
    new.save(&ctx.settings_path())
        .map_err(|e| format!("Could not save the settings: {e}"))?;

    ctx.apply_live(&new);
    for change in new.changes_from(&previous) {
        ctx.diag.info(&app, "settings", change);
    }
    if previous.active_layout != new.active_layout {
        ctx.refresh_pages(&new.active_layout);
    }
    if (previous.api_enabled, previous.api_port) != (new.api_enabled, new.api_port) {
        ctx.api
            .apply(&app, &ctx.hub, &new, &ctx.widgets_dir, &ctx.diag)
            .await;
    }
    let _ = app.emit(EVENT_SETTINGS_CHANGED, &new);
    Ok(new)
}

/// Names of the saved layouts (the active one is always listed, even before its first save).
#[tauri::command]
pub fn list_layouts(ctx: Ctx<'_>) -> Vec<String> {
    let mut names = layout::list(&ctx.config_dir);
    let active = ctx.current_settings().active_layout;
    if !names.contains(&active) {
        names.push(active);
        names.sort_by_key(|n| n.to_lowercase());
    }
    names
}

fn checked_name(name: &str) -> Result<(), String> {
    layout::is_valid_name(name).then_some(()).ok_or_else(|| {
        "Invalid layout name (letters, digits, spaces, - and _; 40 characters max).".to_owned()
    })
}

/// A saved layout (the active one when `name` is omitted), or `null` when it does not exist
/// yet (the frontend then uses its built-in default).
#[tauri::command]
pub fn get_layout(ctx: Ctx<'_>, name: Option<String>) -> Result<Option<Value>, String> {
    let name = name.unwrap_or_else(|| ctx.current_settings().active_layout);
    checked_name(&name)?;
    Ok(layout::load(&layout::path_for(&ctx.config_dir, &name)))
}

#[tauri::command]
pub fn save_layout(
    app: AppHandle,
    ctx: Ctx<'_>,
    name: String,
    layout: Value,
) -> Result<(), String> {
    checked_name(&name)?;
    layout::validate(&layout)?;
    let path = layout::path_for(&ctx.config_dir, &name);
    // What the file holds now becomes a version (at most one every two minutes) before it is replaced.
    if let Some(previous) = layout::load(&path) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(0));
        let _ = layout::record_version(&ctx.config_dir, &name, &previous, now);
    }
    layout::save(&path, &layout).map_err(|e| format!("Could not save the layout: {e}"))?;
    if name == ctx.current_settings().active_layout {
        ctx.refresh_pages(&name);
        let _ = app.emit(
            EVENT_LAYOUT_CHANGED,
            serde_json::json!({ "name": name, "layout": layout }),
        );
    }
    Ok(())
}

/// The older versions kept of a layout, newest first (see `layout::record_version`).
#[tauri::command]
pub fn list_layout_versions(ctx: Ctx<'_>, name: String) -> Result<Vec<layout::Version>, String> {
    checked_name(&name)?;
    Ok(layout::versions(&ctx.config_dir, &name))
}

/// One of those versions, or `null` when it is gone.
#[tauri::command]
pub fn get_layout_version(ctx: Ctx<'_>, name: String, id: u64) -> Result<Option<Value>, String> {
    checked_name(&name)?;
    Ok(layout::load_version(&ctx.config_dir, &name, id))
}

/// Deletes a layout. Deleting the active one falls back to `default`.
#[tauri::command]
pub fn delete_layout(app: AppHandle, ctx: Ctx<'_>, name: String) -> Result<(), String> {
    checked_name(&name)?;
    layout::delete(&layout::path_for(&ctx.config_dir, &name))
        .map_err(|e| format!("Could not delete the layout: {e}"))?;
    layout::delete_history(&ctx.config_dir, &name);
    let fallback = {
        let mut s = ctx.settings.lock().unwrap_or_else(PoisonError::into_inner);
        if s.active_layout != name {
            return Ok(());
        }
        s.active_layout = layout::DEFAULT_NAME.to_owned();
        s.clone()
    };
    let _ = fallback.save(&ctx.settings_path());
    ctx.refresh_pages(&fallback.active_layout);
    let _ = app.emit(EVENT_SETTINGS_CHANGED, fallback);
    Ok(())
}

/// Community widgets found in the widgets folder.
#[tauri::command]
pub fn list_widgets(ctx: Ctx<'_>) -> Vec<overlay_server::widgets::WidgetManifest> {
    overlay_server::widgets::scan(&ctx.widgets_dir)
}

/// Opens the widgets folder in the file explorer.
#[tauri::command]
pub fn open_widgets_folder(ctx: Ctx<'_>) -> Result<(), String> {
    std::fs::create_dir_all(&ctx.widgets_dir).map_err(|e| e.to_string())?;
    std::process::Command::new("explorer")
        .arg(&ctx.widgets_dir)
        .spawn()
        .map(drop)
        .map_err(|e| format!("Could not open the folder: {e}"))
}

/// Path of the widgets folder, for display.
#[tauri::command]
pub fn get_widgets_dir(ctx: Ctx<'_>) -> String {
    ctx.widgets_dir.to_string_lossy().into_owned()
}

/// A window of the app (`overlay`, `main`) starts or stops needing the held keys and mouse buttons.
/// They are only read from the game while somebody asks for them.
#[tauri::command]
pub fn set_input_window(ctx: Ctx<'_>, label: String, wanted: bool) {
    ctx.hub.set_input_window(&label, wanted);
}

/// The last known state of the update check (the interface asks once at startup, then follows `update-status`).
#[tauri::command]
pub fn get_update_status(ctx: Ctx<'_>) -> UpdateStatus {
    ctx.updater.status()
}

/// Looks for a new version now (the "Check now" button): failures are reported, unlike the background check.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> UpdateStatus {
    updater::check(&app, true).await
}

/// Downloads and installs the update found by the last check, then restarts the app.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    updater::install(&app).await
}
