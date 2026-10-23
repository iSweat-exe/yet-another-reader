//! Bridge to RivaTuner Statistics Server (RTSS, shipped with MSI Afterburner).
//!
//! A normal overlay window cannot be drawn over an exclusive-fullscreen game. RTSS already
//! hooks the game's renderer (DX9/10/11/12, Vulkan, OpenGL) and exposes its on-screen display
//! through the `RTSSSharedMemoryV2` file mapping. We only write a text slot into that
//! mapping: nothing is injected into, or read from, osu!lazer by this module.
//!
//! RTSS renders plain text with a few formatting tags (position, colour, size), so this shows
//! a compact text HUD rather than the widget layout.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use lazer_reader::model::GameState;
use overlay_server::Hub;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Name under which our text slot is registered in RTSS.
pub const OWNER: &str = "YetAnotherReader";
pub const EVENT_RTSS_STATUS: &str = "rtss-status";
/// Even if nothing changed, the text is rewritten this often so it survives an RTSS restart.
const REFRESH: Duration = Duration::from_secs(1);

/// Switches shared between the settings and the RTSS thread.
#[derive(Default)]
pub struct RtssControl {
    pub enabled: AtomicBool,
    pub x: AtomicU32,
    pub y: AtomicU32,
    /// Last status, for windows opened after the first event.
    pub status: std::sync::Mutex<RtssStatus>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RtssStatus {
    pub enabled: bool,
    /// RTSS answered on the last write.
    pub available: bool,
    pub message: Option<String>,
}

// --- Shared memory -------------------------------------------------------------------------

const SIGNATURE: u32 = 0x5254_5353; // 'RTSS'
const MIN_VERSION: u32 = 0x0002_0000;
const OSD_EX_VERSION: u32 = 0x0002_0007;

// Header field offsets (all DWORDs).
const OFF_SIGNATURE: usize = 0;
const OFF_VERSION: usize = 4;
const OFF_OSD_ENTRY_SIZE: usize = 20;
const OFF_OSD_ARRAY_OFFSET: usize = 24;
const OFF_OSD_ARRAY_SIZE: usize = 28;
const OFF_OSD_FRAME: usize = 32;

// OSD entry layout.
const ENTRY_TEXT: usize = 0;
const ENTRY_TEXT_LEN: usize = 256;
const ENTRY_OWNER: usize = 256;
const ENTRY_OWNER_LEN: usize = 256;
const ENTRY_TEXT_EX: usize = 512;
const ENTRY_TEXT_EX_LEN: usize = 4096;

/// # Safety
/// `base + offset` must point inside the mapped view.
unsafe fn read_u32(base: *const u8, offset: usize) -> u32 {
    // SAFETY: guaranteed by the caller.
    unsafe { base.add(offset).cast::<u32>().read_unaligned() }
}

/// Writes `value` as a NUL-terminated string into a fixed-size field.
///
/// # Safety
/// `dst..dst + capacity` must be writable.
unsafe fn write_cstr(dst: *mut u8, capacity: usize, value: &str) {
    let bytes = value.as_bytes();
    let len = bytes.len().min(capacity - 1);
    // SAFETY: `len < capacity`, so both the copy and the terminator stay inside the field.
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), dst, len);
        dst.add(len).write(0);
    }
}

/// # Safety
/// `src..src + capacity` must be readable.
unsafe fn cstr_is(src: *const u8, capacity: usize, expected: &str) -> bool {
    // SAFETY: guaranteed by the caller.
    let slice = unsafe { std::slice::from_raw_parts(src, capacity) };
    let end = slice.iter().position(|&b| b == 0).unwrap_or(capacity);
    &slice[..end] == expected.as_bytes()
}

/// Writes `text` into the slot owned by `owner` (claiming a free one if needed).
/// An empty `text` releases the slot.
///
/// # Safety
/// `base` must point to a readable and writable RTSS shared-memory view of at least the size
/// the header describes.
unsafe fn write_locked(base: *mut u8, owner: &str, text: &str) -> Result<(), String> {
    // SAFETY: every dereference below is inside the view, whose layout comes from the header
    // that is validated first.
    unsafe {
        if read_u32(base, OFF_SIGNATURE) != SIGNATURE {
            return Err("unexpected RTSS shared memory signature".into());
        }
        let version = read_u32(base, OFF_VERSION);
        if version < MIN_VERSION {
            return Err(format!("unsupported RTSS version {version:#x}"));
        }
        let entry_size = read_u32(base, OFF_OSD_ENTRY_SIZE) as usize;
        let array_offset = read_u32(base, OFF_OSD_ARRAY_OFFSET) as usize;
        let array_len = read_u32(base, OFF_OSD_ARRAY_SIZE) as usize;
        if entry_size < ENTRY_OWNER + ENTRY_OWNER_LEN {
            return Err("RTSS OSD entry too small".into());
        }

        let entry_at = |i: usize| base.add(array_offset + i * entry_size);
        let slot = (0..array_len)
            .find(|&i| cstr_is(entry_at(i).add(ENTRY_OWNER), ENTRY_OWNER_LEN, owner))
            .or_else(|| {
                (0..array_len).find(|&i| cstr_is(entry_at(i).add(ENTRY_OWNER), ENTRY_OWNER_LEN, ""))
            });
        let Some(slot) = slot else {
            return if text.is_empty() {
                Ok(())
            } else {
                Err("no free RTSS OSD slot".into())
            };
        };

        let entry = entry_at(slot);
        let has_ex = version >= OSD_EX_VERSION && entry_size >= ENTRY_TEXT_EX + ENTRY_TEXT_EX_LEN;
        if text.is_empty() {
            write_cstr(entry.add(ENTRY_TEXT), ENTRY_TEXT_LEN, "");
            write_cstr(entry.add(ENTRY_OWNER), ENTRY_OWNER_LEN, "");
            if has_ex {
                write_cstr(entry.add(ENTRY_TEXT_EX), ENTRY_TEXT_EX_LEN, "");
            }
        } else {
            write_cstr(entry.add(ENTRY_OWNER), ENTRY_OWNER_LEN, owner);
            if has_ex {
                write_cstr(entry.add(ENTRY_TEXT_EX), ENTRY_TEXT_EX_LEN, text);
            } else {
                write_cstr(entry.add(ENTRY_TEXT), ENTRY_TEXT_LEN, text);
            }
        }

        // RTSS redraws when the frame counter changes.
        let frame = base.add(OFF_OSD_FRAME).cast::<u32>();
        frame.write_unaligned(frame.read_unaligned().wrapping_add(1));
        Ok(())
    }
}

#[cfg(windows)]
fn write_osd(text: &str) -> Result<(), String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Memory::{
        FILE_MAP_ALL_ACCESS, MapViewOfFile, OpenFileMappingW, UnmapViewOfFile,
    };
    use windows::core::w;

    // SAFETY: the view is mapped here, only passed to `write_locked` (which stays inside it
    // using the validated header), and unmapped before returning.
    unsafe {
        let handle = OpenFileMappingW(FILE_MAP_ALL_ACCESS.0, false, w!("RTSSSharedMemoryV2"))
            .map_err(|_| "RivaTuner (RTSS) is not running".to_string())?;
        let view = MapViewOfFile(handle, FILE_MAP_ALL_ACCESS, 0, 0, 0);
        if view.Value.is_null() {
            let _ = CloseHandle(handle);
            return Err("could not map the RTSS shared memory".into());
        }
        let result = write_locked(view.Value.cast::<u8>(), OWNER, text);
        let _ = UnmapViewOfFile(view);
        let _ = CloseHandle(handle);
        result
    }
}

// --- Text ----------------------------------------------------------------------------------

/// RTSS text is ANSI and `<` starts a tag, so keep printable ASCII and neutralise `<`.
fn clean(text: &str) -> String {
    text.chars()
        .map(|c| match c {
            '<' | '>' => ' ',
            c if c.is_ascii_graphic() || c == ' ' => c,
            _ => '?',
        })
        .collect()
}

fn thousands(n: i64) -> String {
    let digits = n.unsigned_abs().to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    if n < 0 { format!("-{out}") } else { out }
}

/// The OSD text for the current state; empty (slot released) outside a play.
///
/// Tags: `<P=x,y>` position, `<Cn=RRGGBB>` define a colour (`<Cn>` use, `<C>` reset),
/// `<Sn=percent>` define a size (`<Sn>` use, `<S>` reset).
pub fn format_osd(game: &GameState, x: u32, y: u32) -> String {
    let Some(play) = &game.gameplay else {
        return String::new();
    };
    let mut out = format!(
        "<P={x},{y}><C0=FFFFFF><C1=F472B6><C2=A3A3A3><C3=60A5FA><C4=4ADE80><C5=FBBF24><C6=F87171><S0=60><S1=-25>"
    );

    out += &format!("<S0><C0>{}<S><C>\n", thousands(play.score));
    out += &format!(
        "<C0>{:.2}%<C>  <C2>{}<C>",
        play.accuracy * 100.0,
        clean(&play.rank)
    );
    if let Some(pp) = &play.pp {
        out += &format!("  <C1>{:.0}pp<C>  <C2>FC {:.0}pp<C>", pp.live, pp.fc);
    }
    out += "\n";
    out += &format!("<C0>{}x<C>", play.combo);
    if let Some(ur) = play.unstable_rate {
        out += &format!("  <C2>UR {ur:.1}<C>");
    }
    out += "\n";
    let h = &play.hits;
    out += &format!(
        "<C3>{}<C><S1> 300<S>  <C4>{}<C><S1> 100<S>  <C5>{}<C><S1> 50<S>  <C6>{}<C><S1> miss<S>",
        h.great, h.ok, h.meh, h.miss
    );
    if let Some(map) = &game.beatmap {
        out += &format!(
            "\n<S1><C2>{} [{}]<C><S>",
            clean(&map.title),
            clean(&map.version)
        );
    }
    out
}

// --- Background thread ---------------------------------------------------------------------

pub fn spawn(
    app: AppHandle,
    hub: Hub,
    control: Arc<RtssControl>,
    poll_ms: Arc<AtomicU64>,
) -> std::io::Result<()> {
    thread::Builder::new()
        .name("rtss-bridge".into())
        .spawn(move || run(&app, &hub, &control, &poll_ms))
        .map(drop)
}

#[cfg(windows)]
fn run(app: &AppHandle, hub: &Hub, control: &RtssControl, poll_ms: &AtomicU64) {
    let mut last_text = String::new();
    let mut last_write = Instant::now();
    let mut occupied = false;
    let mut status = RtssStatus::default();
    let publish = |next: RtssStatus, status: &mut RtssStatus| {
        if *status != next {
            let _ = app.emit(EVENT_RTSS_STATUS, &next);
            *control
                .status
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = next.clone();
            *status = next;
        }
    };

    loop {
        thread::sleep(Duration::from_millis(
            poll_ms.load(Ordering::Relaxed).max(16),
        ));

        if !control.enabled.load(Ordering::Relaxed) {
            if occupied {
                let _ = write_osd("");
                occupied = false;
                last_text.clear();
            }
            publish(RtssStatus::default(), &mut status);
            continue;
        }

        let text = format_osd(
            &hub.game(),
            control.x.load(Ordering::Relaxed),
            control.y.load(Ordering::Relaxed),
        );
        if text == last_text && last_write.elapsed() < REFRESH {
            continue;
        }
        match write_osd(&text) {
            Ok(()) => {
                occupied = !text.is_empty();
                last_text = text;
                last_write = Instant::now();
                publish(
                    RtssStatus {
                        enabled: true,
                        available: true,
                        message: None,
                    },
                    &mut status,
                );
            }
            Err(message) => {
                // RTSS is not (yet) running: keep trying, but only report the change once.
                occupied = false;
                last_text.clear();
                last_write = Instant::now();
                publish(
                    RtssStatus {
                        enabled: true,
                        available: false,
                        message: Some(message),
                    },
                    &mut status,
                );
            }
        }
    }
}

#[cfg(not(windows))]
fn run(_: &AppHandle, _: &Hub, _: &RtssControl, _: &AtomicU64) {}

#[cfg(test)]
mod tests {
    use super::*;
    use lazer_reader::model::{Beatmap, Gameplay, Hits, Pp};

    /// A fake RTSS shared-memory view with one OSD entry of the given size.
    fn fake_view(entry_size: usize, version: u32, entries: usize) -> Vec<u8> {
        let array_offset = 64;
        let mut buf = vec![0u8; array_offset + entry_size * entries];
        let mut put = |off: usize, v: u32| buf[off..off + 4].copy_from_slice(&v.to_le_bytes());
        put(OFF_SIGNATURE, SIGNATURE);
        put(OFF_VERSION, version);
        put(OFF_OSD_ENTRY_SIZE, entry_size as u32);
        put(OFF_OSD_ARRAY_OFFSET, array_offset as u32);
        put(OFF_OSD_ARRAY_SIZE, entries as u32);
        buf
    }

    fn read_cstr(buf: &[u8], at: usize, cap: usize) -> String {
        let s = &buf[at..at + cap];
        String::from_utf8_lossy(&s[..s.iter().position(|&b| b == 0).unwrap_or(cap)]).into_owned()
    }

    fn frame(buf: &[u8]) -> u32 {
        u32::from_le_bytes(buf[OFF_OSD_FRAME..OFF_OSD_FRAME + 4].try_into().unwrap())
    }

    const EX_ENTRY: usize = ENTRY_TEXT_EX + ENTRY_TEXT_EX_LEN;

    #[test]
    fn write_should_claim_a_slot_and_store_text_in_the_extended_field() {
        let mut buf = fake_view(EX_ENTRY, OSD_EX_VERSION, 2);
        // SAFETY: `buf` is a valid, writable fake view.
        unsafe { write_locked(buf.as_mut_ptr(), OWNER, "hello") }.unwrap();
        let entry = 64;
        assert_eq!(read_cstr(&buf, entry + ENTRY_OWNER, ENTRY_OWNER_LEN), OWNER);
        assert_eq!(
            read_cstr(&buf, entry + ENTRY_TEXT_EX, ENTRY_TEXT_EX_LEN),
            "hello"
        );
    }

    #[test]
    fn write_should_fall_back_to_the_short_field_on_old_versions() {
        let mut buf = fake_view(ENTRY_OWNER + ENTRY_OWNER_LEN, MIN_VERSION, 1);
        // SAFETY: `buf` is a valid, writable fake view.
        unsafe { write_locked(buf.as_mut_ptr(), OWNER, "old") }.unwrap();
        assert_eq!(read_cstr(&buf, 64 + ENTRY_TEXT, ENTRY_TEXT_LEN), "old");
    }

    #[test]
    fn write_should_reuse_its_slot_and_bump_the_frame_counter() {
        let mut buf = fake_view(EX_ENTRY, OSD_EX_VERSION, 3);
        // SAFETY: `buf` is a valid, writable fake view.
        unsafe {
            write_locked(buf.as_mut_ptr(), OWNER, "a").unwrap();
            write_locked(buf.as_mut_ptr(), OWNER, "b").unwrap();
        }
        assert_eq!(read_cstr(&buf, 64 + ENTRY_TEXT_EX, ENTRY_TEXT_EX_LEN), "b");
        // The other slots stay free.
        assert_eq!(
            read_cstr(&buf, 64 + EX_ENTRY + ENTRY_OWNER, ENTRY_OWNER_LEN),
            ""
        );
        assert_eq!(frame(&buf), 2);
    }

    #[test]
    fn write_should_not_touch_slots_owned_by_others() {
        let mut buf = fake_view(EX_ENTRY, OSD_EX_VERSION, 2);
        buf[64 + ENTRY_OWNER..64 + ENTRY_OWNER + 5].copy_from_slice(b"Other");
        // SAFETY: `buf` is a valid, writable fake view.
        unsafe { write_locked(buf.as_mut_ptr(), OWNER, "mine") }.unwrap();
        assert_eq!(read_cstr(&buf, 64 + ENTRY_OWNER, ENTRY_OWNER_LEN), "Other");
        assert_eq!(
            read_cstr(&buf, 64 + EX_ENTRY + ENTRY_TEXT_EX, ENTRY_TEXT_EX_LEN),
            "mine"
        );
    }

    #[test]
    fn write_should_release_the_slot_with_empty_text() {
        let mut buf = fake_view(EX_ENTRY, OSD_EX_VERSION, 1);
        // SAFETY: `buf` is a valid, writable fake view.
        unsafe {
            write_locked(buf.as_mut_ptr(), OWNER, "x").unwrap();
            write_locked(buf.as_mut_ptr(), OWNER, "").unwrap();
        }
        assert_eq!(read_cstr(&buf, 64 + ENTRY_OWNER, ENTRY_OWNER_LEN), "");
    }

    #[test]
    fn write_should_fail_when_no_slot_is_free() {
        let mut buf = fake_view(EX_ENTRY, OSD_EX_VERSION, 1);
        buf[64 + ENTRY_OWNER..64 + ENTRY_OWNER + 5].copy_from_slice(b"Other");
        // SAFETY: `buf` is a valid, writable fake view.
        assert!(unsafe { write_locked(buf.as_mut_ptr(), OWNER, "x") }.is_err());
    }

    #[test]
    fn write_should_reject_a_foreign_signature() {
        let mut buf = fake_view(EX_ENTRY, OSD_EX_VERSION, 1);
        buf[0] = 0;
        // SAFETY: `buf` is a valid, writable fake view.
        assert!(unsafe { write_locked(buf.as_mut_ptr(), OWNER, "x") }.is_err());
    }

    #[test]
    fn write_should_truncate_text_that_exceeds_the_field() {
        let mut buf = fake_view(EX_ENTRY, OSD_EX_VERSION, 1);
        let long = "a".repeat(ENTRY_TEXT_EX_LEN * 2);
        // SAFETY: `buf` is a valid, writable fake view.
        unsafe { write_locked(buf.as_mut_ptr(), OWNER, &long) }.unwrap();
        assert_eq!(
            read_cstr(&buf, 64 + ENTRY_TEXT_EX, ENTRY_TEXT_EX_LEN).len(),
            ENTRY_TEXT_EX_LEN - 1
        );
    }

    fn playing() -> GameState {
        GameState {
            connected: true,
            beatmap: Some(Beatmap {
                title: "Fish <b> ★".into(),
                version: "Hard".into(),
                ..Beatmap::default()
            }),
            gameplay: Some(Gameplay {
                score: 1_204_331,
                accuracy: 0.9871,
                combo: 214,
                rank: "S".into(),
                hits: Hits {
                    great: 320,
                    ok: 12,
                    meh: 2,
                    miss: 3,
                },
                pp: Some(Pp {
                    live: 188.4,
                    fc: 231.0,
                    ss: 340.0,
                }),
                unstable_rate: Some(144.6),
                ..Gameplay::default()
            }),
            ..GameState::default()
        }
    }

    #[test]
    fn format_osd_should_be_empty_outside_a_play() {
        assert_eq!(format_osd(&GameState::default(), 10, 10), "");
    }

    #[test]
    fn format_osd_should_start_with_the_position_tag() {
        assert!(format_osd(&playing(), 40, 60).starts_with("<P=40,60>"));
    }

    #[test]
    fn format_osd_should_include_the_key_values() {
        let text = format_osd(&playing(), 0, 0);
        for expected in ["1,204,331", "98.71%", "188pp", "214x", "UR 144.6", "320"] {
            assert!(text.contains(expected), "missing {expected} in {text}");
        }
    }

    #[test]
    fn format_osd_should_neutralise_tags_and_non_ascii_in_titles() {
        let text = format_osd(&playing(), 0, 0);
        assert!(text.contains("Fish  b  ?"));
    }

    #[test]
    fn thousands_should_group_digits() {
        assert_eq!(thousands(0), "0");
        assert_eq!(thousands(999), "999");
        assert_eq!(thousands(1000), "1,000");
        assert_eq!(thousands(-1_234_567), "-1,234,567");
    }
}
