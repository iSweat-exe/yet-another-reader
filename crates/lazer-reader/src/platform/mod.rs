//! Operating-system boundary. Each backend exposes the same modules (`process`, `dac`,
//! `window`, `file_version`); the rest of the crate reaches them through this file only.

pub mod paths;
pub mod types;

#[cfg(not(windows))]
pub mod unsupported;
#[cfg(windows)]
pub mod windows;

#[cfg(not(windows))]
pub use self::unsupported::{dac, file_version, process, window};
#[cfg(windows)]
pub use self::windows::{dac, file_version, process, window};
