//! Stub of the Windows `file_version` backend: executables' version resources are not read.

use std::path::Path;

use crate::error::{ReaderError, Result};
use crate::version::LazerVersion;

/// Always fails: reading a PE version resource needs the Windows version API.
pub fn read_product_version(_exe: &Path) -> Result<LazerVersion> {
    Err(ReaderError::Unsupported("reading an executable's version"))
}
