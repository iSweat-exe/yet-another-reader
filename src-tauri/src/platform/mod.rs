//! Desktop behaviour that differs per operating system. Every backend exposes the same
//! functions; the rest of the app calls them through this module and never names a backend.

#[cfg(not(windows))]
mod unsupported;
#[cfg(windows)]
mod windows;

#[cfg(not(windows))]
pub use self::unsupported::{fine_timer, keep_on_top, lower_priority, write_osd};
#[cfg(windows)]
pub use self::windows::{fine_timer, keep_on_top, lower_priority, write_osd};

#[cfg(all(windows, not(debug_assertions)))]
pub use self::windows::disable_browser_shortcuts;
