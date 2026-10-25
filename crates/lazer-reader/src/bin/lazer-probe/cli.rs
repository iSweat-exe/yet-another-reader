//! Low-level commands: poke at the game's managed heap (types, objects, paths, raw memory).

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use anyhow::Result;
use lazer_reader::{ReaderError, clr::Clr, process::Process, version::read_product_version};

/// `lazer-probe watch [interval_ms]`: live GameState as JSON lines, printed when it changes.
fn watch(interval_ms: u64) -> Result<()> {
    let started = Instant::now();
    let mut session = lazer_reader::session::LazerSession::connect()?;
    println!(
        "connected in {:?}; profile: {}",
        started.elapsed(),
        session.profile().source
    );
    let mut last = None;
    loop {
        let tick = Instant::now();
        let state = session.snapshot()?;
        if last.as_ref() != Some(&state) {
            println!(
                "[{:>5}ms] {}",
                tick.elapsed().as_millis(),
                serde_json::to_string(&state)?
            );
            last = Some(state);
        }
        std::thread::sleep(std::time::Duration::from_millis(interval_ms));
    }
}

/// `lazer-probe inputs [interval_ms]`: the keys and mouse buttons held, printed when they change.
fn inputs(interval_ms: u64) -> Result<()> {
    let mut session = lazer_reader::session::LazerSession::connect()?;
    println!("READY: hold some keys now (Ctrl+C to stop)");
    let mut last = None;
    let (mut reads, mut beat) = (0u64, Instant::now());
    loop {
        let tick = Instant::now();
        reads += 1;
        if beat.elapsed().as_secs() >= 5 {
            println!(
                "... {reads} reads so far, nothing held: {}",
                last.as_ref()
                    .is_none_or(lazer_reader::input::InputState::is_empty)
            );
            beat = Instant::now();
        }
        match session.read_inputs() {
            Ok(state) if last.as_ref() != Some(&state) => {
                println!(
                    "[{:>6}us] {}",
                    tick.elapsed().as_micros(),
                    serde_json::to_string(&state)?
                );
                last = Some(state);
            }
            Ok(_) => {}
            Err(e) => println!("read failed: {e}"),
        }
        std::thread::sleep(std::time::Duration::from_millis(interval_ms));
    }
}

pub fn run() -> Result<()> {
    if std::env::args().nth(1).as_deref() == Some("inputs-debug") {
        let mut session = lazer_reader::session::LazerSession::connect()?;
        session.snapshot()?;
        println!("{}", session.debug_inputs());
        return Ok(());
    }
    if std::env::args().nth(1).as_deref() == Some("inputs") {
        let ms = std::env::args()
            .nth(2)
            .and_then(|s| s.parse().ok())
            .unwrap_or(2);
        return inputs(ms);
    }
    if std::env::args().nth(1).as_deref() == Some("window") {
        let pid = Process::attach()?.pid();
        println!("pid {pid}: {:?}", lazer_reader::window::find(pid));
        return Ok(());
    }
    if std::env::args().nth(1).as_deref() == Some("watch") {
        let ms = std::env::args()
            .nth(2)
            .and_then(|s| s.parse().ok())
            .unwrap_or(100);
        return watch(ms);
    }
    let process = match Process::attach() {
        Ok(p) => p,
        Err(ReaderError::ProcessNotFound) => {
            println!("No osu!lazer build is running; start it and re-run the probe.");
            crate::status::print_installed();
            return Ok(());
        }
        Err(e) => return Err(e.into()),
    };

    let exe = process.exe_path()?;
    let version = read_product_version(&exe)?;
    println!("pid      : {}", process.pid());
    println!("exe      : {}", exe.display());
    println!(
        "version  : {version}  (profile key {})",
        version.profile_key()
    );

    let args: Vec<String> = std::env::args().skip(1).collect();
    let clr = Clr::attach(Arc::new(process))?;
    match args.first().map(String::as_str) {
        Some("type") => {
            // lazer-probe type <dll> <Full.Type.Name>
            let dll = args.get(1).map_or("osu.Game.dll", String::as_str);
            let name = args.get(2).map_or("", String::as_str);
            let module = clr.managed_module(dll)?;
            println!(
                "module   : {dll} ({} types, metadata {} bytes)",
                module.metadata.type_count(),
                module.info.metadata_size
            );
            println!("moduledata: {:x?}", module.info.raw);
            let Some(rid) = module.metadata.type_rid(name) else {
                println!("type {name} not found");
                return Ok(());
            };
            let mt = clr.method_table_of(&module, name);
            println!(
                "typedef  : rid {rid:#x}, method table {mt:x?}, typedef map @ {:#x}",
                module.info.type_def_map
            );
            for tok in module.metadata.field_tokens(rid) {
                println!(
                    "  field {tok:#010x} {}",
                    module.metadata.field_name(tok).unwrap_or("?")
                );
            }
            if let Some(mt) = mt {
                println!("mt name  : {:?}", clr.dac.method_table_name(mt));
                println!("mt data  : {:x?}", clr.dac.method_table(mt));
                println!("mt fields: {:x?}", clr.dac.method_table_fields(mt));
                let layout = clr.named_fields(mt)?;
                let mut fields: Vec<_> = layout.iter().collect();
                fields.sort_by_key(|(_, f)| f.offset);
                let started = Instant::now();
                let hits = clr.scan_for_qword(mt, 64);
                println!("scan     : {} hits in {:?}", hits.len(), started.elapsed());
                for h in hits.iter().take(3) {
                    println!("  instance @ {h:#x}");
                    for (name, f) in &fields {
                        let at = h + u64::from(f.offset);
                        let shown = match f.elem_type {
                            // class / szarray / string references: show the target's type
                            0x12 | 0x1d | 0x0e => match clr.process.read_u64(at) {
                                Ok(0) => "null".to_owned(),
                                Ok(p) => clr
                                    .process
                                    .read_u64(p)
                                    .ok()
                                    .and_then(|m| clr.dac.method_table_name(m & !7))
                                    .map_or_else(
                                        || format!("{p:#x} (?)"),
                                        |n| format!("{p:#x} {n}"),
                                    ),
                                Err(e) => format!("<{e}>"),
                            },
                            0x08 => clr
                                .process
                                .read_u32(at)
                                .map_or_else(|e| format!("<{e}>"), |v| format!("{}", v as i32)),
                            0x02 | 0x03 => clr
                                .process
                                .read_bytes(at, 1)
                                .map_or_else(|e| format!("<{e}>"), |v| format!("{}", v[0])),
                            0x0d => clr
                                .process
                                .read_f64(at)
                                .map_or_else(|e| format!("<{e}>"), |v| format!("{v}")),
                            _ => clr
                                .process
                                .read_u64(at)
                                .map_or_else(|e| format!("<{e}>"), |v| format!("{v:#x}")),
                        };
                        println!(
                            "    +{:#05x} t{:<2} {name:<44} {shown}",
                            f.offset, f.elem_type
                        );
                    }
                }
            }
        }
        Some("top") => {
            // lazer-probe top <root_addr_hex> [n]  -- n-th screen from the top of the stack
            let root =
                u64::from_str_radix(args.get(1).map_or("0", |s| s.trim_start_matches("0x")), 16)?;
            let n: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
            let stack = clr.follow(root, &["<ScreenStack>k__BackingField", "stack"])?;
            let screens = stack
                .map(|s| clr.collection_refs(s, "_array"))
                .transpose()?
                .unwrap_or_default();
            let addr = screens.iter().rev().nth(n).copied().unwrap_or(0);
            println!("{addr:x}");
        }
        Some("obj") => {
            let addr =
                u64::from_str_radix(args.get(1).map_or("0", |s| s.trim_start_matches("0x")), 16)?;
            dump_object(&clr, addr, args.get(2).map(String::as_str))?;
        }
        Some("path") => {
            // lazer-probe path <addr_hex> <field.field.field> [filter]
            let addr =
                u64::from_str_radix(args.get(1).map_or("0", |s| s.trim_start_matches("0x")), 16)?;
            let path: Vec<&str> = args
                .get(2)
                .map_or("", String::as_str)
                .split('.')
                .filter(|s| !s.is_empty())
                .collect();
            match clr.follow(addr, &path)? {
                Some(obj) => dump_object(&clr, obj, args.get(3).map(String::as_str))?,
                None => println!("null along the path"),
            }
        }
        Some("instances") => {
            // lazer-probe instances <dll> <Full.Type.Name>  (includes subclasses)
            let dll = args.get(1).map_or("osu.Game.dll", String::as_str);
            let name = args.get(2).map_or("", String::as_str);
            let module = clr.managed_module(dll)?;
            let Some(base) = clr.method_table_of(&module, name) else {
                println!("type {name} not found / not loaded");
                return Ok(());
            };
            let subs = clr.subclasses_of(base)?;
            println!("{} loaded types derive from {name}:", subs.len());
            for (mt, n) in subs.iter().take(12) {
                println!("  {mt:#x} {n}");
            }
            let names: HashMap<u64, String> = subs.iter().cloned().collect();
            let started = Instant::now();
            let hits = clr.scan_for_qwords(&names.keys().copied().collect());
            println!("scan: {} raw hits in {:?}", hits.len(), started.elapsed());
            for (addr, mt) in hits {
                let layout = clr.named_fields(mt)?;
                let ok = clr.looks_like_object(addr, &layout);
                println!(
                    "  {addr:#x} {} -> {}",
                    names[&mt],
                    if ok { "OBJECT" } else { "reference/stale" }
                );
            }
        }
        Some("regions") => {
            let all = clr.process.regions();
            let rw: Vec<_> = all.iter().filter(|r| r.is_private_rw()).collect();
            println!(
                "{} committed regions, {} private rw ({} MiB)",
                all.len(),
                rw.len(),
                rw.iter().map(|r| r.size).sum::<u64>() >> 20
            );
            let mut big = rw.clone();
            big.sort_by_key(|r| std::cmp::Reverse(r.size));
            for r in big.iter().take(15) {
                println!(
                    "  {:#014x} +{:>8} KiB kind {:#x} prot {:#x}",
                    r.base,
                    r.size >> 10,
                    r.kind,
                    r.protect
                );
            }
            let other: u64 = all
                .iter()
                .filter(|r| !r.is_private_rw())
                .map(|r| r.size)
                .sum();
            println!("other committed: {} MiB", other >> 20);
        }
        Some("readbench") => {
            // lazer-probe readbench  -- how fast the private read/write memory can be read, no pauses
            let started = Instant::now();
            let regions: Vec<_> = clr
                .process
                .regions()
                .into_iter()
                .filter(lazer_reader::process::Region::is_private_rw)
                .collect();
            println!("regions listed in {:?}", started.elapsed());
            let started = Instant::now();
            let mut buf = vec![0u8; 1 << 20];
            let (mut total, mut calls) = (0u64, 0u64);
            let mut slow = Vec::new();
            for r in &regions {
                let region_started = Instant::now();
                let mut pos = r.base;
                let end = r.base + r.size;
                while pos < end {
                    let want = buf.len().min((end - pos) as usize);
                    let got = clr.process.read_into(pos, &mut buf[..want]);
                    calls += 1;
                    total += got as u64;
                    pos += if got < 8 { 0x1000 } else { got as u64 };
                }
                slow.push((region_started.elapsed(), r.base, r.size, r.protect));
            }
            slow.sort_by_key(|s| std::cmp::Reverse(s.0));
            for (t, base, size, protect) in slow.iter().take(8) {
                println!("  {t:?}  {base:#x} +{} KiB prot {protect:#x}", size >> 10);
            }
            println!(
                "read {} MiB in {} calls: {:?}",
                total >> 20,
                calls,
                started.elapsed()
            );
        }
        Some("scan") => {
            // lazer-probe scan <qword_hex> [limit]
            let value =
                u64::from_str_radix(args.get(1).map_or("0", |s| s.trim_start_matches("0x")), 16)?;
            let limit: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(20);
            let hits = clr.scan_for_qword(value, limit);
            println!(
                "{} hits for {value:#x} ({:?})",
                hits.len(),
                clr.dac.method_table_name(value)
            );
            for h in hits {
                let bytes = clr.process.read_bytes(h, 32).unwrap_or_default();
                println!(
                    "  {h:#x}: {}",
                    bytes
                        .iter()
                        .map(|b| format!("{b:02x}"))
                        .collect::<Vec<_>>()
                        .join(" ")
                );
            }
        }
        Some("fd") => {
            // lazer-probe fd <first_field_hex> <count>
            let first =
                u64::from_str_radix(args.get(1).map_or("0", |s| s.trim_start_matches("0x")), 16)?;
            let count: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(8);
            for i in 0..count {
                let addr = first + i * 16;
                match clr.dac.field_desc(addr) {
                    Ok(f) => println!(
                        "{addr:#x}: token {:#x} off {:#x} type {} static {} next {:#x}",
                        f.token, f.offset, f.elem_type, f.is_static, f.next_field
                    ),
                    Err(e) => println!("{addr:#x}: {e}"),
                }
            }
        }
        Some("peek") => {
            let addr =
                u64::from_str_radix(args.get(1).map_or("0", |s| s.trim_start_matches("0x")), 16)?;
            let len: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(64);
            let bytes = clr.process.read_bytes(addr, len)?;
            for (i, row) in bytes.chunks(16).enumerate() {
                let hex: Vec<String> = row.iter().map(|b| format!("{b:02x}")).collect();
                println!("{:#x}: {}", addr + (i * 16) as u64, hex.join(" "));
            }
        }
        _ => println!(
            "low-level commands: watch [ms] | inputs [ms] | type <dll> <T> | instances <dll> <T> | obj <addr> [filter] | path <addr> <a.b.c> | scan <qword> | regions | readbench | peek <addr> [len] | fd <addr> [n]"
        ),
    }
    Ok(())
}

fn dump_object(clr: &Clr, addr: u64, filter: Option<&str>) -> Result<()> {
    let Some(mt) = clr.object_mt(addr) else {
        println!("{addr:#x} is not a managed object");
        return Ok(());
    };
    println!("{addr:#x}: {}", clr.type_name(mt));
    let layout = clr.layout_of(mt)?;
    let mut fields: Vec<_> = layout.iter().collect();
    fields.sort_by_key(|(_, f)| f.offset);
    for (name, f) in fields {
        if filter.is_some_and(|q| {
            !q.split([' ', '|'])
                .any(|s| name.to_lowercase().contains(&s.to_lowercase()))
        }) {
            continue;
        }
        let at = addr + u64::from(f.offset);
        let shown = match f.elem_type {
            0x12 | 0x1d | 0x0e => match clr.process.read_u64(at) {
                Ok(0) => "null".to_owned(),
                Ok(p) => match clr.object_mt(p) {
                    Some(m) if clr.type_name(m) == "System.String" => {
                        format!("{p:#x} {:?}", clr.read_string(p).unwrap_or_default())
                    }
                    Some(m) => format!("{p:#x} {}", clr.type_name(m)),
                    None => format!("{p:#x} (not an object)"),
                },
                Err(e) => format!("<{e}>"),
            },
            0x02 | 0x03 => clr
                .process
                .read_bytes(at, 1)
                .map_or_else(|e| format!("<{e}>"), |v| format!("{}", v[0])),
            0x08 | 0x09 => clr
                .process
                .read_u32(at)
                .map_or_else(|e| format!("<{e}>"), |v| format!("{}", v as i32)),
            0x0d => clr
                .process
                .read_f64(at)
                .map_or_else(|e| format!("<{e}>"), |v| format!("{v}")),
            0x0c => clr
                .process
                .read_u32(at)
                .map_or_else(|e| format!("<{e}>"), |v| format!("{}", f32::from_bits(v))),
            _ => clr
                .process
                .read_u64(at)
                .map_or_else(|e| format!("<{e}>"), |v| format!("{v:#x}")),
        };
        println!(
            "  +{:#05x} t{:<2} {name:<44} {shown}",
            f.offset, f.elem_type
        );
    }
    Ok(())
}
