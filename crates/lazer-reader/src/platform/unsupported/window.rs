//! Stub of the Windows `window` backend: there is no game window to measure.

pub use crate::platform::types::GameWindow;

/// Always `None`: window lookup is only implemented on Windows.
#[must_use]
pub fn find(_pid: u32) -> Option<GameWindow> {
    None
}
