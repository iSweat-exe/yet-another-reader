//! Windows implementation of the desktop behaviour that differs per operating system.

use tauri::WebviewWindow;

use crate::rtss::{OWNER, write_locked};

/// Re-asserts the topmost, non-activating state (see the call sites for when this is done).
pub fn keep_on_top(window: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GetWindowLongPtrW, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        SetWindowLongPtrW, SetWindowPos, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };

    let Ok(raw) = window.hwnd() else { return };
    let hwnd = HWND(raw.0);
    // SAFETY: `hwnd` belongs to a live window owned by this process; the calls only adjust its
    // extended style and z-order.
    unsafe {
        let wanted = (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW).0 as isize;
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        if style & wanted != wanted {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style | wanted);
        }
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

/// While the inputs are read every few milliseconds, ask Windows for a 1 ms timer so those naps
/// are not rounded up to its default ~15 ms tick.
pub fn fine_timer(on: bool) {
    use windows::Win32::Media::{timeBeginPeriod, timeEndPeriod};
    // SAFETY: plain calls with no pointers; every `timeBeginPeriod` is matched by a `timeEndPeriod`.
    unsafe {
        if on {
            timeBeginPeriod(1);
        } else {
            timeEndPeriod(1);
        }
    }
}

/// The reader must never compete with the game for CPU time.
pub fn lower_priority() {
    use windows::Win32::System::Threading::{
        GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL,
    };
    // SAFETY: operates on the calling thread's own pseudo-handle.
    let _ = unsafe { SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL) };
}

/// Writes `text` into RivaTuner's shared memory (see `crate::rtss`), or releases our slot when
/// `text` is empty.
pub fn write_osd(text: &str) -> Result<(), String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Memory::{
        FILE_MAP_ALL_ACCESS, MapViewOfFile, OpenFileMappingW, UnmapViewOfFile,
    };
    use windows::core::w;

    // SAFETY: the view is mapped here, only passed to `write_locked` (which stays inside it
    // using the validated header), and unmapped before returning.
    unsafe {
        let handle = OpenFileMappingW(FILE_MAP_ALL_ACCESS.0, false, w!("RTSSSharedMemoryV2"))
            .map_err(|_| "RivaTuner (RTSS) is not running".to_string())?;
        let view = MapViewOfFile(handle, FILE_MAP_ALL_ACCESS, 0, 0, 0);
        if view.Value.is_null() {
            let _ = CloseHandle(handle);
            return Err("could not map the RTSS shared memory".into());
        }
        let result = write_locked(view.Value.cast::<u8>(), OWNER, text);
        let _ = UnmapViewOfFile(view);
        let _ = CloseHandle(handle);
        result
    }
}

/// Switches off the shortcuts of the browser engine (find, print, reload, zoom, back/forward, view source...) in
/// the main window: it is an application, and they only get in the way. Release builds only, so that
/// `tauri dev` keeps its developer tools (the page already cancels the common ones, see `src/lib/browserKeys.ts`).
#[cfg(not(debug_assertions))]
pub fn disable_browser_shortcuts(window: &WebviewWindow) {
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
