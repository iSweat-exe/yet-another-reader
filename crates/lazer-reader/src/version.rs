//! Detection of the exact osu!lazer build, re-evaluated on every attach so that
//! a game update is noticed and the matching offsets profile gets selected.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::error::ReaderError;

/// A lazer build, parsed from the exe's `ProductVersion`
/// (e.g. `2026.1005.0-lazer+9a10d935b05a3b896f4bd811d620f2023331db93`).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct LazerVersion {
    /// Release number, e.g. `2026.1005.0`.
    pub release: String,
    /// Release channel suffix, e.g. `lazer`.
    pub channel: Option<String>,
    /// Git commit the build was made from; the most precise build identity.
    pub commit: Option<String>,
}

impl LazerVersion {
    /// Key used to look up an offsets profile (`<release>` or `<release>+<short commit>`).
    #[must_use]
    pub fn profile_key(&self) -> String {
        match &self.commit {
            Some(c) => format!("{}+{}", self.release, &c[..c.len().min(8)]),
            None => self.release.clone(),
        }
    }
}

impl fmt::Display for LazerVersion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.release)?;
        if let Some(ch) = &self.channel {
            write!(f, "-{ch}")?;
        }
        if let Some(c) = &self.commit {
            write!(f, "+{}", &c[..c.len().min(8)])?;
        }
        Ok(())
    }
}

impl FromStr for LazerVersion {
    type Err = ReaderError;

    fn from_str(raw: &str) -> Result<Self, Self::Err> {
        let invalid = || ReaderError::InvalidVersion(raw.to_owned());
        let (head, commit) = match raw.trim().split_once('+') {
            Some((h, c)) => (h, Some(c.to_owned()).filter(|c| !c.is_empty())),
            None => (raw.trim(), None),
        };
        let (release, channel) = match head.split_once('-') {
            Some((r, ch)) => (r, Some(ch.to_owned())),
            None => (head, None),
        };
        let numeric_parts = release
            .split('.')
            .filter(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
            .count();
        if numeric_parts != 3 || release.split('.').count() != 3 {
            return Err(invalid());
        }
        Ok(Self {
            release: release.to_owned(),
            channel,
            commit,
        })
    }
}

#[cfg(windows)]
pub use win::read_product_version;

#[cfg(windows)]
mod win {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    use windows::Win32::Storage::FileSystem::{
        GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
    };
    use windows::core::PCWSTR;

    use super::LazerVersion;
    use crate::error::{ReaderError, Result};

    /// Reads and parses the `ProductVersion` string resource of an executable.
    pub fn read_product_version(exe: &Path) -> Result<LazerVersion> {
        let path: Vec<u16> = exe.as_os_str().encode_wide().chain([0]).collect();
        let path = PCWSTR(path.as_ptr());

        // SAFETY: `path` is a NUL-terminated UTF-16 buffer that outlives every call below.
        let size = unsafe { GetFileVersionInfoSizeW(path, None) };
        if size == 0 {
            return Err(ReaderError::NoVersionInfo(exe.to_owned()));
        }
        let mut block = vec![0u8; size as usize];
        // SAFETY: `block` is `size` bytes long, as reported by the call above.
        unsafe { GetFileVersionInfoW(path, None, size, block.as_mut_ptr().cast()) }
            .map_err(|e| ReaderError::os("GetFileVersionInfoW", &e))?;

        let translations = query(&block, "\\VarFileInformation\\Translation", 1)
            .map(|raw| {
                raw.as_chunks::<4>()
                    .0
                    .iter()
                    .map(|c| {
                        (
                            u16::from_le_bytes([c[0], c[1]]),
                            u16::from_le_bytes([c[2], c[3]]),
                        )
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let fallback = [(0x0409, 0x04b0), (0x0000, 0x04b0)];
        for (lang, codepage) in translations.into_iter().chain(fallback) {
            let sub = format!("\\StringFileInfo\\{lang:04x}{codepage:04x}\\ProductVersion");
            if let Some(raw) = query(&block, &sub, 2) {
                let text = String::from_utf16_lossy(
                    &raw.as_chunks::<2>()
                        .0
                        .iter()
                        .map(|c| u16::from_le_bytes(*c))
                        .take_while(|&u| u != 0)
                        .collect::<Vec<_>>(),
                );
                return text.parse();
            }
        }
        Err(ReaderError::NoVersionInfo(exe.to_owned()))
    }

    /// Looks up `sub_block` in a version-info block and copies the value out.
    fn query(block: &[u8], sub_block: &str, unit: usize) -> Option<Vec<u8>> {
        let sub: Vec<u16> = sub_block.encode_utf16().chain([0]).collect();
        let mut ptr: *mut c_void = std::ptr::null_mut();
        let mut len = 0u32;
        // SAFETY: `block` is a valid version-info block and `sub` is NUL-terminated.
        let ok = unsafe {
            VerQueryValueW(
                block.as_ptr().cast(),
                PCWSTR(sub.as_ptr()),
                &mut ptr,
                &mut len,
            )
        };
        if !ok.as_bool() || ptr.is_null() || len == 0 {
            return None;
        }
        // `len` counts bytes for binary values and UTF-16 units for strings; `unit`
        // converts it. The value points inside `block`, so we clamp to its bounds.
        let start = (ptr as usize).checked_sub(block.as_ptr() as usize)?;
        let end = start.checked_add(len as usize * unit)?.min(block.len());
        block.get(start..end).map(<[u8]>::to_vec)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RAW: &str = "2026.1005.0-lazer+9a10d935b05a3b896f4bd811d620f2023331db93";

    #[test]
    fn parse_should_split_release_channel_and_commit() {
        let v: LazerVersion = RAW.parse().unwrap();
        assert_eq!(v.release, "2026.1005.0");
        assert_eq!(v.channel.as_deref(), Some("lazer"));
        assert_eq!(
            v.commit.as_deref(),
            Some("9a10d935b05a3b896f4bd811d620f2023331db93")
        );
    }

    #[test]
    fn parse_should_accept_plain_release() {
        let v: LazerVersion = "2026.1005.1".parse().unwrap();
        assert_eq!(v.commit, None);
        assert_eq!(v.channel, None);
    }

    #[test]
    fn parse_should_reject_garbage() {
        assert!("not-a-version".parse::<LazerVersion>().is_err());
        assert!("1.2".parse::<LazerVersion>().is_err());
    }

    #[test]
    fn profile_key_should_use_short_commit() {
        let v: LazerVersion = RAW.parse().unwrap();
        assert_eq!(v.profile_key(), "2026.1005.0+9a10d935");
    }
}
