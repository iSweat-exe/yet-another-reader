//! Geometry of osu!lazer's main window, so an overlay can be laid over it.
//!
//! Read-only: only window queries (`EnumWindows`, `GetClientRect`, ...), no messages are sent.

use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Gdi::ClientToScreen;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClientRect, GetForegroundWindow, GetWindowTextLengthW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible,
};
use windows::core::BOOL;

/// The game window's client area in physical screen pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GameWindow {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    /// The game window is the foreground window.
    pub focused: bool,
    pub minimized: bool,
}

struct Search {
    pid: u32,
    best: Option<(HWND, i64)>,
}

unsafe extern "system" fn visit(hwnd: HWND, lparam: LPARAM) -> BOOL {
    // SAFETY: `lparam` is the `&mut Search` passed by `find` and outlives the enumeration.
    let search = unsafe { &mut *(lparam.0 as *mut Search) };

    let mut owner = 0u32;
    // SAFETY: `hwnd` is a valid handle supplied by EnumWindows; `owner` is a valid out pointer.
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut owner)) };
    // SAFETY: plain queries on a valid window handle.
    let shown = unsafe { IsWindowVisible(hwnd).as_bool() && GetWindowTextLengthW(hwnd) > 0 };
    if owner != search.pid || !shown {
        return BOOL(1);
    }

    let mut rect = RECT::default();
    // SAFETY: `rect` is a valid out pointer.
    if unsafe { GetClientRect(hwnd, &mut rect) }.is_ok() {
        let area = i64::from(rect.right - rect.left) * i64::from(rect.bottom - rect.top);
        if search.best.is_none_or(|(_, best)| area > best) {
            search.best = Some((hwnd, area));
        }
    }
    BOOL(1)
}

/// Finds the main window of process `pid` (the largest visible, titled top-level window).
pub fn find(pid: u32) -> Option<GameWindow> {
    let mut search = Search { pid, best: None };
    // SAFETY: the callback only dereferences `lparam` as the `Search` it points to, and
    // EnumWindows returns before `search` goes out of scope.
    let _ = unsafe { EnumWindows(Some(visit), LPARAM(&raw mut search as isize)) };
    let (hwnd, area) = search.best?;
    if area == 0 {
        return None;
    }

    let mut rect = RECT::default();
    let mut origin = POINT { x: 0, y: 0 };
    // SAFETY: valid window handle and out pointers.
    let (client, mapped, minimized, foreground) = unsafe {
        (
            GetClientRect(hwnd, &mut rect).is_ok(),
            ClientToScreen(hwnd, &mut origin).as_bool(),
            IsIconic(hwnd).as_bool(),
            GetForegroundWindow(),
        )
    };
    (client && mapped).then(|| GameWindow {
        x: origin.x,
        y: origin.y,
        width: (rect.right - rect.left).max(0) as u32,
        height: (rect.bottom - rect.top).max(0) as u32,
        focused: foreground == hwnd,
        minimized,
    })
}
