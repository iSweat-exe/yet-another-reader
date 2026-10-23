use std::path::PathBuf;

/// Everything that can go wrong while attaching to or reading from osu!lazer.
#[derive(Debug, thiserror::Error)]
pub enum ReaderError {
    #[error("osu!lazer is not running")]
    ProcessNotFound,

    #[error("process {pid} is not osu!lazer (osu.Game.dll is not loaded)")]
    NotLazer { pid: u32 },

    #[error("{op} failed: {message}")]
    Os { op: &'static str, message: String },

    #[error("short read of {len} bytes at {addr:#x}")]
    ShortRead { addr: u64, len: usize },

    #[error("CLR data access layer: {0}")]
    Dac(String),

    #[error("unrecognised lazer version string: {0:?}")]
    InvalidVersion(String),

    #[error("no version resource in {}", .0.display())]
    NoVersionInfo(PathBuf),
}

pub type Result<T, E = ReaderError> = std::result::Result<T, E>;

#[cfg(windows)]
impl ReaderError {
    pub(crate) fn os(op: &'static str, err: &windows::core::Error) -> Self {
        Self::Os {
            op,
            message: err.message(),
        }
    }
}
