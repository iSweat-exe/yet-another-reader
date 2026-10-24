//! Reads the `ProductVersion` resource of an executable through the Win32 version API.

use std::ffi::c_void;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use windows::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
};
use windows::core::PCWSTR;

use crate::error::{ReaderError, Result};
use crate::version::LazerVersion;

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
