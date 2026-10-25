//! Files imported by the user for the overlay's widgets (pictures for the `image` widget, fonts for the text
//! style): validation and storage.
//!
//! A picture is copied into one folder of the app's data and named after a hash of its content
//! (`<32 hex>.<ext>`), so the name the user's file had never reaches the disk and importing the same
//! file twice gives the same id. The id is all a layout keeps; the API serves the bytes at
//! `GET /api/v1/images/{id}`. Only the formats below are accepted (five picture formats and four font formats),
//! checked by their signature (the extension of the original file is never trusted).

use std::fmt::Write as _;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};

/// Largest picture accepted, in bytes.
pub const MAX_IMAGE_BYTES: usize = 15 * 1024 * 1024;

/// Number of hex digits of a hash in an id (128 bits).
const HASH_DIGITS: usize = 32;

/// A picture or font format the overlay can show.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageKind {
    Png,
    Jpeg,
    Gif,
    Webp,
    Svg,
    Ttf,
    Otf,
    Woff,
    Woff2,
}

impl ImageKind {
    const ALL: [ImageKind; 9] = [
        Self::Png,
        Self::Jpeg,
        Self::Gif,
        Self::Webp,
        Self::Svg,
        Self::Ttf,
        Self::Otf,
        Self::Woff,
        Self::Woff2,
    ];

    #[must_use]
    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Gif => "gif",
            Self::Webp => "webp",
            Self::Svg => "svg",
            Self::Ttf => "ttf",
            Self::Otf => "otf",
            Self::Woff => "woff",
            Self::Woff2 => "woff2",
        }
    }

    #[must_use]
    pub fn mime(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Gif => "image/gif",
            Self::Webp => "image/webp",
            Self::Svg => "image/svg+xml",
            Self::Ttf => "font/ttf",
            Self::Otf => "font/otf",
            Self::Woff => "font/woff",
            Self::Woff2 => "font/woff2",
        }
    }

    fn from_extension(ext: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|k| k.extension() == ext)
    }
}

/// Why a file was not accepted. The messages are shown to the user as they are.
#[derive(Debug, PartialEq, Eq)]
pub enum ImageError {
    Empty,
    TooLarge,
    UnsupportedFormat,
    Unsafe,
    Io(String),
}

impl std::fmt::Display for ImageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Empty => f.write_str("the file is empty"),
            Self::TooLarge => write!(
                f,
                "the picture is larger than {} MB",
                MAX_IMAGE_BYTES / (1024 * 1024)
            ),
            Self::UnsupportedFormat => f.write_str(
                "not a PNG, JPEG, GIF, WebP or SVG picture, nor a TTF, OTF, WOFF or WOFF2 font",
            ),
            Self::Unsafe => f.write_str("the SVG contains a script, which is refused"),
            Self::Io(e) => write!(f, "could not store the picture: {e}"),
        }
    }
}

impl std::error::Error for ImageError {}

/// An imported picture, as listed by the app.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub id: String,
    pub bytes: u64,
}

/// The format of `bytes`, from their signature, or why they are refused.
///
/// # Errors
/// [`ImageError`] when the data is empty, too large, not a supported picture, or an SVG with a script.
pub fn validate(bytes: &[u8]) -> Result<ImageKind, ImageError> {
    if bytes.is_empty() {
        return Err(ImageError::Empty);
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(ImageError::TooLarge);
    }
    let kind = sniff(bytes).ok_or(ImageError::UnsupportedFormat)?;
    if kind == ImageKind::Svg && has_script(bytes) {
        return Err(ImageError::Unsafe);
    }
    Ok(kind)
}

fn sniff(b: &[u8]) -> Option<ImageKind> {
    if b.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        Some(ImageKind::Png)
    } else if b.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some(ImageKind::Jpeg)
    } else if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
        Some(ImageKind::Gif)
    } else if b.len() >= 12 && &b[..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        Some(ImageKind::Webp)
    } else if b.starts_with(&[0x00, 0x01, 0x00, 0x00]) || b.starts_with(b"true") {
        Some(ImageKind::Ttf)
    } else if b.starts_with(b"OTTO") {
        Some(ImageKind::Otf)
    } else if b.starts_with(b"wOFF") {
        Some(ImageKind::Woff)
    } else if b.starts_with(b"wOF2") {
        Some(ImageKind::Woff2)
    } else if looks_like_svg(b) {
        Some(ImageKind::Svg)
    } else {
        None
    }
}

/// An SVG is text: after an optional BOM and blanks it starts with `<?xml`, `<!--`, `<!DOCTYPE` or `<svg`,
/// and an `<svg` element appears in its first kilobytes.
fn looks_like_svg(b: &[u8]) -> bool {
    let head = &b[..b.len().min(4096)];
    let Ok(text) =
        std::str::from_utf8(head).or_else(|e| std::str::from_utf8(&head[..e.valid_up_to()]))
    else {
        return false;
    };
    let text = text.trim_start_matches('\u{feff}').trim_start();
    let lower = text.to_ascii_lowercase();
    let starts_ok = ["<?xml", "<!--", "<!doctype svg", "<svg"]
        .iter()
        .any(|p| lower.starts_with(p));
    starts_ok && lower.contains("<svg")
}

/// A script in an SVG (`<script>`, event attributes such as `onload=`, `javascript:` links). The picture is
/// only ever shown through `<img>` (which never runs scripts) and served with a sandboxing policy, so this is a
/// second line of defence, not the only one.
fn has_script(b: &[u8]) -> bool {
    let lower = String::from_utf8_lossy(b).to_ascii_lowercase();
    lower.contains("<script") || lower.contains("javascript:") || has_event_attribute(&lower)
}

fn has_event_attribute(lower: &str) -> bool {
    let bytes = lower.as_bytes();
    let mut from = 0;
    while let Some(pos) = lower[from..].find("on") {
        let at = from + pos;
        from = at + 2;
        let preceded_by_space = at > 0 && bytes[at - 1].is_ascii_whitespace();
        if !preceded_by_space {
            continue;
        }
        let name_end = lower[at..]
            .find(|c: char| !c.is_ascii_alphabetic())
            .map_or(lower.len(), |n| at + n);
        let rest = lower[name_end..].trim_start();
        if name_end - at > 2 && rest.starts_with('=') {
            return true;
        }
    }
    false
}

/// Whether `id` has the shape of an id made by [`import`]: 32 lowercase hex digits, a dot, an extension of
/// a supported format. Nothing else ever becomes a path.
#[must_use]
pub fn is_valid_id(id: &str) -> bool {
    let Some((hash, ext)) = id.split_once('.') else {
        return false;
    };
    hash.len() == HASH_DIGITS
        && hash
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        && ImageKind::from_extension(ext).is_some()
}

/// The kind of picture an id names, if the id is valid.
#[must_use]
pub fn kind_of_id(id: &str) -> Option<ImageKind> {
    if !is_valid_id(id) {
        return None;
    }
    id.split_once('.')
        .and_then(|(_, ext)| ImageKind::from_extension(ext))
}

/// Path of a stored picture, or `None` when `id` is not a valid id.
#[must_use]
pub fn path_for(dir: &Path, id: &str) -> Option<PathBuf> {
    is_valid_id(id).then(|| dir.join(id))
}

fn id_for(bytes: &[u8], kind: ImageKind) -> String {
    let digest = Sha256::digest(bytes);
    let mut id = String::with_capacity(HASH_DIGITS + 5);
    for byte in &digest[..HASH_DIGITS / 2] {
        let _ = write!(id, "{byte:02x}");
    }
    id.push('.');
    id.push_str(kind.extension());
    id
}

/// Validates `bytes` and copies them into `dir` (created if needed); returns the picture's id.
///
/// # Errors
/// [`ImageError`] when the data is refused or cannot be written.
pub fn import(dir: &Path, bytes: &[u8]) -> Result<ImageInfo, ImageError> {
    let kind = validate(bytes)?;
    let id = id_for(bytes, kind);
    let io_err = |e: io::Error| ImageError::Io(e.to_string());
    fs::create_dir_all(dir).map_err(io_err)?;
    let target = dir.join(&id);
    if !target.is_file() {
        // Written beside, then renamed: a reader never sees half a picture.
        let partial = dir.join(format!("{id}.part"));
        fs::write(&partial, bytes).map_err(io_err)?;
        fs::rename(&partial, &target).map_err(io_err)?;
    }
    Ok(ImageInfo {
        id,
        bytes: bytes.len() as u64,
    })
}

/// The imported pictures, newest first.
#[must_use]
pub fn list(dir: &Path) -> Vec<ImageInfo> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut found: Vec<(std::time::SystemTime, ImageInfo)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let id = entry.file_name().into_string().ok()?;
            if !is_valid_id(&id) {
                return None;
            }
            let meta = entry.metadata().ok().filter(fs::Metadata::is_file)?;
            Some((
                meta.modified().unwrap_or(std::time::UNIX_EPOCH),
                ImageInfo {
                    id,
                    bytes: meta.len(),
                },
            ))
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.id.cmp(&b.1.id)));
    found.into_iter().map(|(_, info)| info).collect()
}

/// Removes an imported picture. A picture that is already gone is not an error.
///
/// # Errors
/// [`ImageError`] when `id` is invalid or the file cannot be removed.
pub fn delete(dir: &Path, id: &str) -> Result<(), ImageError> {
    let path = path_for(dir, id).ok_or(ImageError::UnsupportedFormat)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(ImageError::Io(e.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yar-images-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn validate_should_recognise_each_format_by_its_signature() {
        assert_eq!(validate(PNG), Ok(ImageKind::Png));
        assert_eq!(validate(&[0xFF, 0xD8, 0xFF, 0xE0, 0]), Ok(ImageKind::Jpeg));
        assert_eq!(validate(b"GIF89a\x01\x00"), Ok(ImageKind::Gif));
        assert_eq!(validate(b"GIF87a\x01\x00"), Ok(ImageKind::Gif));
        assert_eq!(
            validate(b"RIFF\x10\x00\x00\x00WEBPVP8 "),
            Ok(ImageKind::Webp)
        );
        assert_eq!(
            validate(b"<?xml version=\"1.0\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\"/>"),
            Ok(ImageKind::Svg)
        );
        assert_eq!(
            validate(b"\xEF\xBB\xBF  <svg width=\"1\"/>"),
            Ok(ImageKind::Svg)
        );
    }

    #[test]
    fn validate_should_recognise_the_font_formats_by_their_signature() {
        assert_eq!(
            validate(&[0x00, 0x01, 0x00, 0x00, 0x00]),
            Ok(ImageKind::Ttf)
        );
        assert_eq!(validate(b"true\x00"), Ok(ImageKind::Ttf));
        assert_eq!(validate(b"OTTO\x00"), Ok(ImageKind::Otf));
        assert_eq!(validate(b"wOFF\x00"), Ok(ImageKind::Woff));
        assert_eq!(validate(b"wOF2\x00"), Ok(ImageKind::Woff2));
        assert_eq!(ImageKind::Woff2.mime(), "font/woff2");
        let id = format!("{}.woff2", "ab".repeat(16));
        assert!(is_valid_id(&id));
        assert_eq!(kind_of_id(&id), Some(ImageKind::Woff2));
    }

    #[test]
    fn validate_should_refuse_what_is_not_a_picture() {
        assert_eq!(validate(b""), Err(ImageError::Empty));
        assert_eq!(
            validate(b"MZ\x90\x00 an exe renamed to .png"),
            Err(ImageError::UnsupportedFormat)
        );
        assert_eq!(
            validate(b"RIFF\x10\x00\x00\x00WAVEfmt "),
            Err(ImageError::UnsupportedFormat)
        );
        assert_eq!(
            validate(b"<html><svg></svg></html>"),
            Err(ImageError::UnsupportedFormat)
        );
        assert_eq!(validate(b"just text"), Err(ImageError::UnsupportedFormat));
    }

    #[test]
    fn validate_should_refuse_a_picture_over_the_size_limit() {
        let mut big = PNG.to_vec();
        big.resize(MAX_IMAGE_BYTES + 1, 0);
        assert_eq!(validate(&big), Err(ImageError::TooLarge));
        big.truncate(MAX_IMAGE_BYTES);
        assert_eq!(validate(&big), Ok(ImageKind::Png));
    }

    #[test]
    fn validate_should_refuse_an_svg_with_a_script() {
        for svg in [
            &b"<svg xmlns=\"x\"><script>alert(1)</script></svg>"[..],
            b"<svg xmlns=\"x\" onload=\"alert(1)\"/>",
            b"<svg xmlns=\"x\"><a href=\"JavaScript:alert(1)\"/></svg>",
            b"<svg xmlns=\"x\"\n\tONCLICK = \"x()\"/>",
        ] {
            assert_eq!(
                validate(svg),
                Err(ImageError::Unsafe),
                "{}",
                String::from_utf8_lossy(svg)
            );
        }
        // A word that merely contains "on" is fine.
        assert_eq!(
            validate(b"<svg xmlns=\"x\"><text font-weight=\"bold\" id=\"icon\">on</text></svg>"),
            Ok(ImageKind::Svg)
        );
    }

    #[test]
    fn is_valid_id_should_only_accept_ids_made_by_import() {
        let good = format!("{}.png", "ab".repeat(16));
        assert!(is_valid_id(&good));
        for bad in [
            "",
            "..",
            "../secret.png",
            "..\\secret.png",
            "a/b.png",
            &format!("{}.exe", "ab".repeat(16)),
            &format!("{}.PNG", "ab".repeat(16)),
            &format!("{}.png", "AB".repeat(16)),
            &format!("{}.png", "ab".repeat(15)),
            &format!("{}.png.part", "ab".repeat(16)),
            &format!("{}.png/", "ab".repeat(16)),
            "CON.png",
        ] {
            assert!(!is_valid_id(bad), "{bad:?} should be refused");
            assert!(path_for(Path::new("x"), bad).is_none());
        }
    }

    #[test]
    fn import_should_store_the_picture_under_a_hashed_name_and_dedupe() {
        let dir = temp_dir("import");
        let first = import(&dir, PNG).unwrap();
        let second = import(&dir, PNG).unwrap();
        assert_eq!(first, second);
        assert!(is_valid_id(&first.id));
        assert!(first.id.ends_with(".png"));
        assert_eq!(fs::read(dir.join(&first.id)).unwrap(), PNG);
        assert_eq!(
            fs::read_dir(&dir).unwrap().count(),
            1,
            "no leftover .part file"
        );
        let other = import(&dir, b"GIF89a\x01\x00").unwrap();
        assert_ne!(other.id, first.id);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn import_should_not_write_anything_for_a_refused_file() {
        let dir = temp_dir("refused");
        assert!(import(&dir, b"nope").is_err());
        assert!(!dir.exists() || fs::read_dir(&dir).unwrap().count() == 0);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_and_delete_should_only_touch_valid_ids() {
        let dir = temp_dir("list");
        let info = import(&dir, PNG).unwrap();
        fs::write(dir.join("notes.txt"), "x").unwrap();
        assert_eq!(list(&dir), vec![info.clone()]);
        assert!(delete(&dir, "notes.txt").is_err());
        assert!(dir.join("notes.txt").exists());
        delete(&dir, &info.id).unwrap();
        delete(&dir, &info.id).unwrap();
        assert!(list(&dir).is_empty());
        assert!(list(&dir.join("missing")).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
