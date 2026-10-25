//! Read-only access to the osu!lazer process.
//!
//! The handle is opened with `PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION`
//! only: this crate never writes to, injects into, or controls the game.

use std::path::PathBuf;

use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Diagnostics::Debug::ReadProcessMemory;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, MODULEENTRY32W, Module32FirstW, Module32NextW, PROCESSENTRY32W,
    Process32FirstW, Process32NextW, TH32CS_SNAPMODULE, TH32CS_SNAPMODULE32, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Memory::{
    MEM_COMMIT, MEMORY_BASIC_INFORMATION, PAGE_GUARD, PAGE_NOACCESS, VirtualQueryEx,
};
use windows::Win32::System::Threading::{
    GetExitCodeProcess, OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    PROCESS_VM_READ, QueryFullProcessImageNameW,
};
use windows::core::PWSTR;

use crate::error::{ReaderError, Result};
pub use crate::platform::types::{Found, Module, Region};

/// Loaded only by lazer; osu!stable shares the exe name but not this assembly.
const LAZER_MARKER_MODULE: &str = "osu.Game.dll";

/// An open read-only handle to a running osu!lazer.
pub struct Process {
    handle: HANDLE,
    pid: u32,
}

// SAFETY: a process HANDLE is just a kernel object id; it may be used from any thread.
unsafe impl Send for Process {}
// SAFETY: every method takes `&self` and only issues read-only, thread-safe Win32 calls.
unsafe impl Sync for Process {}

impl Drop for Process {
    fn drop(&mut self) {
        // SAFETY: `handle` was returned by OpenProcess and is closed exactly once here.
        let _ = unsafe { CloseHandle(self.handle) };
    }
}

impl Process {
    /// Finds a running lazer-family build (lazer, tachyon, a development build, ...) and opens it
    /// for reading. Any process that loads `osu.Game.dll` qualifies, whatever its executable is
    /// called; `YAR_GAME_PID` forces one process when several builds run side by side.
    pub fn attach() -> Result<Self> {
        let forced = std::env::var("YAR_GAME_PID")
            .ok()
            .and_then(|v| v.trim().parse::<u32>().ok());
        let mut rejected = None;
        for (pid, name) in candidate_pids()? {
            if forced.is_some_and(|f| f != pid) {
                continue;
            }
            let process = match Self::open(pid) {
                Ok(p) => p,
                // Only a process that looks like the game must be readable; others are best effort.
                Err(e) if is_osu_name(&name) => return Err(e),
                Err(_) => continue,
            };
            if process.module(LAZER_MARKER_MODULE)?.is_some() {
                return Ok(process);
            }
            rejected = Some(pid);
        }
        Err(
            rejected.map_or(ReaderError::ProcessNotFound, |pid| ReaderError::NotLazer {
                pid,
            }),
        )
    }

    /// Opens a specific process, checking that it is a lazer-family build.
    pub fn attach_pid(pid: u32) -> Result<Self> {
        let process = Self::open(pid)?;
        if process.module(LAZER_MARKER_MODULE)?.is_some() {
            Ok(process)
        } else {
            Err(ReaderError::NotLazer { pid })
        }
    }

    /// Every process that might be a game build, with whether it really is one. Used by
    /// diagnostics: it explains why nothing was attached.
    #[must_use]
    pub fn discover() -> Vec<Found> {
        let Ok(pids) = candidate_pids() else {
            return Vec::new();
        };
        pids.into_iter()
            .map(|(pid, name)| match Self::open(pid) {
                Ok(p) => match p.module(LAZER_MARKER_MODULE) {
                    Ok(Some(_)) => Found {
                        pid,
                        name,
                        is_lazer: true,
                        note: None,
                    },
                    Ok(None) => Found {
                        pid,
                        name,
                        is_lazer: false,
                        note: Some(
                            "osu.Game.dll is not loaded (osu!stable or another program)".into(),
                        ),
                    },
                    Err(e) => Found {
                        pid,
                        name,
                        is_lazer: false,
                        note: Some(e.to_string()),
                    },
                },
                Err(e) => Found {
                    pid,
                    name,
                    is_lazer: false,
                    note: Some(e.to_string()),
                },
            })
            .collect()
    }

    fn open(pid: u32) -> Result<Self> {
        // SAFETY: plain FFI call; the returned handle is owned by `Process`.
        let handle = unsafe {
            OpenProcess(
                PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION,
                false,
                pid,
            )
        }
        .map_err(|e| ReaderError::os("OpenProcess", &e))?;
        Ok(Self { handle, pid })
    }

    /// Whether the process has not exited yet.
    #[must_use]
    pub fn is_running(&self) -> bool {
        let mut code = 0u32;
        // SAFETY: `handle` is a valid process handle owned by `self`; `code` is a valid out pointer.
        let ok = unsafe { GetExitCodeProcess(self.handle, &mut code) }.is_ok();
        // STILL_ACTIVE (259) is what a running process reports.
        ok && code == 259
    }

    #[must_use]
    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// Full path of the running executable.
    pub fn exe_path(&self) -> Result<PathBuf> {
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        // SAFETY: `buf` is `len` UTF-16 units long and `len` is updated by the call.
        unsafe {
            QueryFullProcessImageNameW(
                self.handle,
                PROCESS_NAME_WIN32,
                PWSTR(buf.as_mut_ptr()),
                &mut len,
            )
        }
        .map_err(|e| ReaderError::os("QueryFullProcessImageNameW", &e))?;
        Ok(PathBuf::from(String::from_utf16_lossy(
            &buf[..len as usize],
        )))
    }

    /// All loaded modules (including the CLR runtime and lazer assemblies).
    pub fn modules(&self) -> Result<Vec<Module>> {
        let snapshot = Snapshot::new(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, self.pid)?;
        let mut entry = MODULEENTRY32W {
            dwSize: size_of::<MODULEENTRY32W>() as u32,
            ..Default::default()
        };
        let mut out = Vec::new();
        // SAFETY: `entry.dwSize` is initialised and the snapshot handle is valid.
        let mut next = unsafe { Module32FirstW(snapshot.0, &mut entry) };
        while next.is_ok() {
            out.push(Module {
                name: wide_to_string(&entry.szModule),
                base: entry.modBaseAddr as u64,
                size: entry.modBaseSize,
            });
            // SAFETY: same invariants as above.
            next = unsafe { Module32NextW(snapshot.0, &mut entry) };
        }
        Ok(out)
    }

    /// Finds a module by case-insensitive name.
    pub fn module(&self, name: &str) -> Result<Option<Module>> {
        Ok(self
            .modules()?
            .into_iter()
            .find(|m| m.name.eq_ignore_ascii_case(name)))
    }

    /// Committed, readable regions in the whole address space (used for heap scans).
    #[must_use]
    pub fn regions(&self) -> Vec<Region> {
        let mut out = Vec::new();
        let mut addr = 0usize;
        loop {
            let mut info = MEMORY_BASIC_INFORMATION::default();
            // SAFETY: `info` is a valid out-buffer of the size we pass.
            let written = unsafe {
                VirtualQueryEx(
                    self.handle,
                    Some(addr as *const _),
                    &mut info,
                    size_of::<MEMORY_BASIC_INFORMATION>(),
                )
            };
            if written == 0 {
                break;
            }
            let readable = info.State == MEM_COMMIT
                && !info.Protect.contains(PAGE_NOACCESS)
                && !info.Protect.contains(PAGE_GUARD);
            if readable {
                out.push(Region {
                    base: info.BaseAddress as u64,
                    size: info.RegionSize as u64,
                    kind: info.Type.0,
                    protect: info.Protect.0,
                });
            }
            match (info.BaseAddress as usize).checked_add(info.RegionSize) {
                Some(next) if next > addr => addr = next,
                _ => break,
            }
        }
        out
    }

    /// Reads exactly `len` bytes at `addr`.
    pub fn read_bytes(&self, addr: u64, len: usize) -> Result<Vec<u8>> {
        let mut buf = vec![0u8; len];
        let mut read = 0usize;
        // SAFETY: `buf` is `len` bytes; the OS validates the remote range and reports failure.
        let res = unsafe {
            ReadProcessMemory(
                self.handle,
                addr as *const _,
                buf.as_mut_ptr().cast(),
                len,
                Some(&mut read),
            )
        };
        if res.is_err() || read != len {
            return Err(ReaderError::ShortRead { addr, len });
        }
        Ok(buf)
    }

    /// Reads as many bytes as possible into `buf`; returns how many were copied.
    /// Unlike [`read_bytes`](Self::read_bytes) a partial copy is not an error.
    pub fn read_into(&self, addr: u64, buf: &mut [u8]) -> usize {
        let mut read = 0usize;
        // SAFETY: `buf` is valid for `buf.len()` writes; the OS validates the remote range.
        // A failure with a partial copy still reports the bytes that were copied in `read`.
        let _ = unsafe {
            ReadProcessMemory(
                self.handle,
                addr as *const _,
                buf.as_mut_ptr().cast(),
                buf.len(),
                Some(&mut read),
            )
        };
        read
    }

    pub fn read_u32(&self, addr: u64) -> Result<u32> {
        let b = self.read_bytes(addr, 4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    pub fn read_u64(&self, addr: u64) -> Result<u64> {
        let b = self.read_bytes(addr, 8)?;
        Ok(u64::from_le_bytes([
            b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
        ]))
    }

    pub fn read_f64(&self, addr: u64) -> Result<f64> {
        self.read_u64(addr).map(f64::from_bits)
    }
}

/// RAII toolhelp snapshot handle.
struct Snapshot(HANDLE);

impl Snapshot {
    fn new(
        flags: windows::Win32::System::Diagnostics::ToolHelp::CREATE_TOOLHELP_SNAPSHOT_FLAGS,
        pid: u32,
    ) -> Result<Self> {
        // SAFETY: plain FFI call; handle ownership moves into `Snapshot`.
        unsafe { CreateToolhelp32Snapshot(flags, pid) }
            .map(Self)
            .map_err(|e| ReaderError::os("CreateToolhelp32Snapshot", &e))
    }
}

impl Drop for Snapshot {
    fn drop(&mut self) {
        // SAFETY: closed exactly once.
        let _ = unsafe { CloseHandle(self.0) };
    }
}

/// Names a game build can run under: `osu!.exe` (lazer, tachyon), `osu.Desktop.exe` and friends
/// (development builds), or the `dotnet` host when the game is launched through it.
fn is_osu_name(name: &str) -> bool {
    name.to_ascii_lowercase().starts_with("osu")
}

fn is_candidate_name(name: &str) -> bool {
    is_osu_name(name) || name.eq_ignore_ascii_case("dotnet.exe")
}

fn candidate_pids() -> Result<Vec<(u32, String)>> {
    let snapshot = Snapshot::new(TH32CS_SNAPPROCESS, 0)?;
    let mut entry = PROCESSENTRY32W {
        dwSize: size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    let mut out = Vec::new();
    // SAFETY: `entry.dwSize` is initialised and the snapshot handle is valid.
    let mut next = unsafe { Process32FirstW(snapshot.0, &mut entry) };
    while next.is_ok() {
        let name = wide_to_string(&entry.szExeFile);
        if is_candidate_name(&name) {
            out.push((entry.th32ProcessID, name));
        }
        // SAFETY: same invariants as above.
        next = unsafe { Process32NextW(snapshot.0, &mut entry) };
    }
    Ok(out)
}

fn wide_to_string(buf: &[u16]) -> String {
    let end = buf.iter().position(|&u| u == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}
