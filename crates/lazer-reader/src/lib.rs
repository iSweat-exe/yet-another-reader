//! Read-only game state reader for osu!lazer (Windows).
//!
//! Safety contract: the process is only ever opened with read rights. Nothing here
//! writes to the game's memory, injects code, or synthesises input.

#![warn(clippy::must_use_candidate)]

pub mod error;
pub mod events;
pub mod input;
pub mod metadata;
pub mod model;
pub mod pp;
pub mod profile;
pub mod version;

#[cfg(windows)]
pub mod clr;
#[cfg(windows)]
pub mod dac;
#[cfg(windows)]
pub mod process;
#[cfg(windows)]
pub mod readers;
#[cfg(windows)]
pub mod session;
#[cfg(windows)]
pub mod window;

pub use error::{ReaderError, Result};
pub use version::LazerVersion;
