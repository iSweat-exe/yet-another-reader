//! Read-only game state reader for osu!lazer (Windows).
//!
//! Safety contract: the process is only ever opened with read rights. Nothing here
//! writes to the game's memory, injects code, or synthesises input.

#![warn(clippy::must_use_candidate)]

pub mod error;
pub mod events;
pub mod graph;
pub mod input;
pub mod metadata;
pub mod model;
pub mod pp;
pub mod profile;
pub mod version;

mod platform;

pub use platform::{dac, paths, process, window};

pub mod clr;
pub mod readers;
pub mod session;

pub use error::{ReaderError, Result};
pub use version::LazerVersion;
