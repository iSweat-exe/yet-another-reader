//! Pictures imported for the overlay's `image` widget (the checks and the storage are in
//! `overlay_server::images`; the API serves them at `/api/v1/images/{id}`).

use std::path::{Path, PathBuf};

use overlay_server::images::{self, ImageInfo};
use tauri::ipc::{InvokeBody, Request};

use crate::context::Ctx;

/// The folder of the imported pictures, inside the app's config folder.
pub(crate) fn dir_in(config_dir: &Path) -> PathBuf {
    config_dir.join("images")
}

/// Copies a picture into the app's data. The bytes arrive as the raw body of the call, the original file
/// name is never sent: the stored name is a hash of the content. Returns the id to keep in the layout.
#[tauri::command]
pub fn import_image(request: Request<'_>, ctx: Ctx<'_>) -> Result<ImageInfo, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the raw bytes of a picture".into());
    };
    images::import(&dir_in(&ctx.config_dir), bytes).map_err(|e| e.to_string())
}

/// The imported pictures, newest first.
#[tauri::command]
pub fn list_images(ctx: Ctx<'_>) -> Vec<ImageInfo> {
    images::list(&dir_in(&ctx.config_dir))
}

/// Removes an imported picture; a widget that still uses it shows its placeholder.
#[tauri::command]
pub fn delete_image(ctx: Ctx<'_>, id: String) -> Result<(), String> {
    images::delete(&dir_in(&ctx.config_dir), &id).map_err(|e| e.to_string())
}
