mod api;
mod commands;
mod context;
mod diag;
mod layout;
mod overlay;
mod reader;
mod rtss;
mod settings;
mod updater;

use std::sync::atomic::{AtomicU32, AtomicU64};
use std::sync::{Arc, Mutex, PoisonError};

use context::{AppContext, EVENT_SETTINGS_CHANGED, api_settings};
use overlay::OverlayControl;
use overlay_server::Hub;
use reader::ReaderContext;
use rtss::RtssControl;
use settings::Settings;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Shortcut that shows/hides the in-game overlay.
fn toggle_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyO)
}

fn toggle_overlay(app: &AppHandle) {
    let ctx = app.state::<Arc<AppContext>>();
    let updated = {
        let mut s = ctx.settings.lock().unwrap_or_else(PoisonError::into_inner);
        s.overlay_enabled = !s.overlay_enabled;
        s.clone()
    };
    let _ = updated.save(&ctx.settings_path());
    ctx.apply_live(&updated);
    let _ = app.emit(EVENT_SETTINGS_CHANGED, &updated);
}

/// On first run (no widgets folder yet) drops a small example so there is something to copy.
fn install_example_widget(widgets_dir: &std::path::Path) {
    if widgets_dir.exists() {
        return;
    }
    let example = widgets_dir.join("hello-score");
    if std::fs::create_dir_all(&example).is_ok() {
        let _ = std::fs::write(
            example.join("manifest.json"),
            include_str!("../../docs/examples/hello-score/manifest.json"),
        );
        let _ = std::fs::write(
            example.join("index.html"),
            include_str!("../../docs/examples/hello-score/index.html"),
        );
    }
}

/// Switches off the shortcuts of the browser engine (find, print, reload, zoom, back/forward, view source...) in
/// the main window: it is an application, and they only get in the way. Release builds only, so that
/// `tauri dev` keeps its developer tools (the page already cancels the common ones, see `src/lib/browserKeys.ts`).
#[cfg(all(windows, not(debug_assertions)))]
fn disable_browser_shortcuts(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows_core::Interface;

    let result = window.with_webview(|webview| {
        // SAFETY: the controller belongs to this window and is only used on the UI thread `with_webview` runs on.
        let settings = unsafe {
            webview
                .controller()
                .CoreWebView2()
                .and_then(|core| core.Settings())
        };
        if let Ok(settings) = settings
            && let Ok(settings) = settings.cast::<ICoreWebView2Settings3>()
        {
            // SAFETY: plain setter on a live COM object.
            let _ = unsafe { settings.SetAreBrowserAcceleratorKeysEnabled(false) };
        }
    });
    if let Err(error) = result {
        eprintln!("could not disable the browser shortcuts: {error}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[expect(
    clippy::expect_used,
    reason = "failing to start the Tauri runtime is unrecoverable"
)]
pub fn run() {
    tauri::Builder::default()
        // Must come first. A second launch would fight the first for the API port and the overlay shortcut:
        // it ends at once and brings the running window forward instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if *shortcut == toggle_shortcut() && event.state() == ShortcutState::Pressed {
                        toggle_overlay(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // The shortcut is a convenience: if another program (or another instance of this one)
            // already owns it, the app still starts, only without the shortcut.
            if let Err(error) = app.global_shortcut().register(toggle_shortcut()) {
                eprintln!("overlay shortcut unavailable: {error}");
            }

            let config_dir = app.path().app_config_dir()?;
            let settings = Settings::load(&settings::file_in(&config_dir));

            let widgets_dir = config_dir.join("widgets");
            install_example_widget(&widgets_dir);

            let ctx = Arc::new(AppContext {
                hub: Hub::new(api_settings(&settings)),
                settings: Mutex::new(settings.clone()),
                config_dir,
                widgets_dir,
                poll_ms: Arc::new(AtomicU64::new(settings.poll_interval_ms)),
                input_ms: Arc::new(AtomicU64::new(settings.input_poll_interval_ms)),
                overlay_fps: Arc::new(AtomicU32::new(settings.overlay_fps)),
                overlay: Arc::new(OverlayControl::default()),
                rtss: Arc::new(RtssControl::default()),
                api: api::ApiSupervisor::default(),
                diag: diag::Diag::default(),
                updater: updater::Updater::default(),
            });
            ctx.apply_live(&settings);
            app.manage(Arc::clone(&ctx));

            reader::spawn(ReaderContext {
                app: app.handle().clone(),
                hub: ctx.hub.clone(),
                poll_ms: Arc::clone(&ctx.poll_ms),
                input_ms: Arc::clone(&ctx.input_ms),
                overlay_fps: Arc::clone(&ctx.overlay_fps),
                diag: ctx.diag.clone(),
            })?;

            rtss::spawn(
                app.handle().clone(),
                ctx.hub.clone(),
                Arc::clone(&ctx.rtss),
                Arc::clone(&ctx.poll_ms),
            )?;

            #[cfg(all(windows, not(debug_assertions)))]
            if let Some(main) = app.get_webview_window("main") {
                disable_browser_shortcuts(&main);
            }

            updater::spawn(app.handle().clone());

            overlay::create(app.handle())?;
            ctx.refresh_pages(&settings.active_layout);
            overlay::spawn_tracker(
                app.handle().clone(),
                Arc::clone(&ctx.overlay),
                ctx.hub.clone(),
            )?;

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                ctx.api
                    .apply(&handle, &ctx.hub, &settings, &ctx.widgets_dir, &ctx.diag)
                    .await;
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            // The hidden overlay window would keep the process alive after the main window is
            // closed (Tauri only exits once every window is gone), so closing the main one ends the app.
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_game_state,
            commands::get_reader_status,
            commands::get_settings,
            commands::get_api_status,
            commands::get_rtss_status,
            commands::get_diag,
            commands::get_update_status,
            commands::check_for_update,
            commands::install_update,
            commands::preview_overlay,
            commands::set_settings,
            commands::list_layouts,
            commands::get_layout,
            commands::save_layout,
            commands::delete_layout,
            commands::list_widgets,
            commands::open_widgets_folder,
            commands::get_widgets_dir,
            commands::set_input_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
