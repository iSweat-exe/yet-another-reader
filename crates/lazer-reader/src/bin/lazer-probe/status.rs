//! What the probe knows about the game *around* the memory reads: which processes are candidates,
//! which build runs, where it is installed and where it keeps its data.

use std::path::PathBuf;

use anyhow::Result;
use lazer_reader::{LazerVersion, process::Process, version::read_product_version};

/// One line per process that might be a game build, and why it was kept or ruled out.
pub fn candidates() -> Vec<(u32, String, Result<(), String>)> {
    Process::discover()
        .into_iter()
        .map(|f| {
            let verdict = if f.is_lazer {
                Ok(())
            } else {
                Err(f.note.unwrap_or_else(|| "not a lazer build".to_owned()))
            };
            (f.pid, f.name, verdict)
        })
        .collect()
}

/// Everything about one attached process that needs no heap walk.
#[derive(Debug, Clone, Default)]
pub struct ProcessInfo {
    pub pid: u32,
    pub exe: PathBuf,
    pub version: Option<LazerVersion>,
    pub install_dir: Option<PathBuf>,
    pub data_dir: Option<PathBuf>,
    pub modules: Vec<(String, u64, u32)>,
    pub private_mib: u64,
    pub window: Option<String>,
}

impl ProcessInfo {
    pub fn read(process: &Process) -> Self {
        let exe = process.exe_path().unwrap_or_default();
        lazer_reader::paths::set_running_exe(&exe);
        let mut modules: Vec<_> = process
            .modules()
            .unwrap_or_default()
            .into_iter()
            .map(|m| (m.name, m.base, m.size))
            .collect();
        modules.sort_by_key(|m| m.0.to_ascii_lowercase());
        Self {
            pid: process.pid(),
            install_dir: exe.parent().map(PathBuf::from),
            version: read_product_version(&exe).ok(),
            exe,
            data_dir: lazer_reader::paths::storage_root(),
            private_mib: process
                .regions()
                .iter()
                .filter(|r| r.is_private_rw())
                .map(|r| r.size)
                .sum::<u64>()
                >> 20,
            window: lazer_reader::window::find(process.pid()).map(|w| format!("{w:?}")),
            modules,
        }
    }
}

/// The build installed on disk, for when the game is not running.
pub fn print_installed() {
    for dir in lazer_reader::paths::install_dirs() {
        let exe = dir.join(lazer_reader::paths::game_exe_name());
        match read_product_version(&exe) {
            Ok(v) => println!(
                "installed: {v}  stream {}  (profile key {})  {}",
                v.stream(),
                v.profile_key(),
                exe.display()
            ),
            Err(_) => println!("not found : {}", exe.display()),
        }
    }
    if let Some(data) = lazer_reader::paths::storage_root() {
        println!("data dir : {}", data.display());
    }
}

/// `lazer-probe status [--json]`: a one-shot diagnosis, to paste into a bug report.
pub fn run(json: bool) -> Result<()> {
    let found = candidates();
    let attached = Process::attach();
    if json {
        let mut out = serde_json::json!({
            "candidates": found.iter().map(|(pid, name, v)| serde_json::json!({
                "pid": pid, "name": name, "lazer": v.is_ok(), "note": v.as_ref().err(),
            })).collect::<Vec<_>>(),
        });
        if let Ok(p) = &attached {
            let info = ProcessInfo::read(p);
            out["attached"] = serde_json::json!({
                "pid": info.pid,
                "exe": info.exe,
                "version": info.version.as_ref().map(ToString::to_string),
                "stream": info.version.as_ref().map(|v| v.stream().to_owned()),
                "dataDir": info.data_dir,
                "modules": info.modules.len(),
                "privateMiB": info.private_mib,
            });
        }
        println!("{}", serde_json::to_string_pretty(&out)?);
        return Ok(());
    }
    println!("candidate processes: {}", found.len());
    for (pid, name, verdict) in &found {
        match verdict {
            Ok(()) => println!("  {pid:>6}  {name:<20} lazer build"),
            Err(why) => println!("  {pid:>6}  {name:<20} skipped: {why}"),
        }
    }
    match attached {
        Ok(p) => {
            let info = ProcessInfo::read(&p);
            println!("\nattached : pid {}", info.pid);
            println!("exe      : {}", info.exe.display());
            if let Some(v) = &info.version {
                println!(
                    "version  : {v}  stream {}  profile key {}",
                    v.stream(),
                    v.profile_key()
                );
            } else {
                println!("version  : none readable (development build?)");
            }
            if let Some(d) = &info.data_dir {
                println!("data dir : {}", d.display());
            }
            println!(
                "modules  : {}   private memory: {} MiB",
                info.modules.len(),
                info.private_mib
            );
        }
        Err(e) => {
            println!("\nnot attached: {e}");
            print_installed();
        }
    }
    Ok(())
}
