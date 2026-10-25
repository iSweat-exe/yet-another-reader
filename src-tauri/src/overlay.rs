//! The in-game overlay: a transparent, click-through window laid over osu!lazer's window.
//!
//! The overlay never takes focus or input. A tracker thread follows the game window and
//! shows/hides the overlay accordingly. Exclusive fullscreen is not supported (Windows does
//! not draw other windows over it); borderless/windowed mode, lazer's default, works.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use lazer_reader::model::{GameState, PlayingState, Screen};
use lazer_reader::process::Process;
use lazer_reader::window::{self, GameWindow};
use overlay_server::Hub;

use crate::layout;
use crate::platform::keep_on_top;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

pub const LABEL: &str = "overlay";
const TRACK_INTERVAL: Duration = Duration::from_millis(150);
/// The window stays up this long after the play ends (avoids flicker on retry / results).
const HIDE_DELAY: Duration = Duration::from_millis(1200);

/// Switches shared between the settings and the tracker thread.
#[derive(Default)]
pub struct OverlayControl {
    pub enabled: AtomicBool,
    pub only_when_focused: AtomicBool,
    /// Set while a preview runs: show the overlay whatever the other switches say.
    pub force_visible: AtomicBool,
    /// Pages of the game the active layout draws something on (see `layout::pages_mask`).
    pub pages_mask: AtomicU8,
}

pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window =
        WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#overlay".into()))
            .title("Yet Another Reader overlay")
            // No custom WebView2 browser args: every window shares one environment, so args that
            // differ from the main window's make creation fail (HRESULT 0x8007139F).
            .inner_size(1280.0, 720.0)
            .transparent(true)
            .decorations(false)
            .shadow(false)
            .resizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .focusable(false)
            .focused(false)
            .visible(false)
            .build()?;
    window.set_ignore_cursor_events(true)?;
    Ok(window)
}

pub fn spawn_tracker(
    app: AppHandle,
    control: Arc<OverlayControl>,
    hub: Hub,
) -> std::io::Result<()> {
    thread::Builder::new()
        .name("overlay-tracker".into())
        .spawn(move || track(&app, &control, &hub))
        .map(drop)
}

fn track(app: &AppHandle, control: &OverlayControl, hub: &Hub) {
    let mut pid: Option<u32> = None;
    let mut placed: Option<GameWindow> = None;
    let mut shown = false;
    let mut was_focused = false;
    let mut last_wanted = Instant::now();

    loop {
        thread::sleep(TRACK_INTERVAL);
        let Some(overlay) = app.get_webview_window(LABEL) else {
            continue;
        };

        // Re-resolve the game process only when the cached one has no window any more.
        let mut game = pid.and_then(window::find);
        if game.is_none() {
            pid = Process::attach().ok().map(|p| p.pid());
            game = pid.and_then(window::find);
        }

        // A window laid over the game forces Windows to compose it with the game instead of
        // presenting the game directly, which costs latency and smoothness. So the window only
        // exists on screen while something is drawn: during a play (plus a short grace period),
        // or on any other page (song select, results, ...) the layout has widgets for.
        let forced = control.force_visible.load(Ordering::Relaxed);
        let state = hub.game();
        let needed = page_of(&state)
            .is_some_and(|bit| control.pages_mask.load(Ordering::Relaxed) & bit != 0);
        if needed {
            last_wanted = Instant::now();
        }
        let content = forced || needed || (shown && last_wanted.elapsed() < HIDE_DELAY);
        let visible = game.is_some_and(|g| {
            !g.minimized
                && (forced
                    || (control.enabled.load(Ordering::Relaxed)
                        && content
                        && (g.focused || !control.only_when_focused.load(Ordering::Relaxed))))
        });

        match (visible, game) {
            (true, Some(g)) => {
                if placed
                    .is_none_or(|p| (p.x, p.y, p.width, p.height) != (g.x, g.y, g.width, g.height))
                {
                    let _ = overlay.set_size(PhysicalSize::new(g.width, g.height));
                    let _ = overlay.set_position(PhysicalPosition::new(g.x, g.y));
                    placed = Some(g);
                }
                if !shown {
                    shown = overlay.show().is_ok();
                    keep_on_top(&overlay);
                } else if g.focused && !was_focused {
                    // The game just came back to the front: it may have taken the z-order.
                    // This is done on that transition only, never periodically: other overlays
                    // (Discord's) also claim "topmost", and re-asserting every tick would make
                    // the two windows swap places endlessly.
                    keep_on_top(&overlay);
                }
                was_focused = g.focused;
            }
            _ => {
                if shown {
                    shown = overlay.hide().is_err();
                }
            }
        }
    }
}

/// Bit (see `layout::page_bit`) of the page the game is on, or `None` when nothing is drawn for
/// it. Mirrors `pageOf` in `src/overlay/pages.ts`.
fn page_of(state: &GameState) -> Option<u8> {
    if !state.connected {
        return None;
    }
    let name = match (&state.gameplay, state.screen) {
        (Some(play), _) if play.paused => "paused",
        (Some(_), _) if state.playing == PlayingState::Break => "break",
        (Some(_), _) => "playing",
        (None, Screen::SongSelect) => "songSelect",
        (None, Screen::Results) => "results",
        (None, Screen::Menu) => "menu",
        _ => return None,
    };
    layout::page_bit(name)
}
