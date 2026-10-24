//! Stub of the Windows `process` backend.

use std::path::PathBuf;

use crate::error::{ReaderError, Result};

pub use crate::platform::types::{Module, Region};

/// An open handle to a running osu!lazer. Uninhabited here: it can never be built, so the
/// methods below are unreachable and need no body.
pub enum Process {}

impl Process {
    /// Always fails: this platform cannot read another process yet.
    pub fn attach() -> Result<Self> {
        Err(ReaderError::Unsupported("reading osu!lazer's memory"))
    }

    #[must_use]
    pub fn is_running(&self) -> bool {
        match *self {}
    }

    #[must_use]
    pub fn pid(&self) -> u32 {
        match *self {}
    }

    pub fn exe_path(&self) -> Result<PathBuf> {
        match *self {}
    }

    pub fn modules(&self) -> Result<Vec<Module>> {
        match *self {}
    }

    pub fn module(&self, _name: &str) -> Result<Option<Module>> {
        match *self {}
    }

    #[must_use]
    pub fn regions(&self) -> Vec<Region> {
        match *self {}
    }

    pub fn read_bytes(&self, _addr: u64, _len: usize) -> Result<Vec<u8>> {
        match *self {}
    }

    #[must_use]
    pub fn read_into(&self, _addr: u64, _buf: &mut [u8]) -> usize {
        match *self {}
    }

    pub fn read_u32(&self, _addr: u64) -> Result<u32> {
        match *self {}
    }

    pub fn read_u64(&self, _addr: u64) -> Result<u64> {
        match *self {}
    }

    pub fn read_f64(&self, _addr: u64) -> Result<f64> {
        match *self {}
    }
}
