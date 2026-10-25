//! Stand-in backend for platforms without a port yet. It has the same surface as `windows/`,
//! so the crate compiles everywhere. Every call that would reach the OS returns
//! `ReaderError::Unsupported`, and nothing here can be constructed.

pub mod dac;
pub mod file_version;
pub mod process;
pub mod window;
