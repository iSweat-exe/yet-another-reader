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

pub use crate::platform::file_version::read_product_version;

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
