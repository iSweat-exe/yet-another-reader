//! `lazer-probe`: see and debug everything the reader knows about a running osu!lazer.
//!
//! No argument opens the live terminal UI. The other commands are one-shot or low level.

mod cli;
mod explorer;
mod status;
mod tui;

use std::io::IsTerminal;

use anyhow::Result;

const HELP: &str = "lazer-probe: inspect what Yet Another Reader sees of osu!lazer

USAGE
  lazer-probe                 live terminal UI (game, player, beatmap, user, inputs, process, raw)
  lazer-probe status [--json] which processes and builds are found, where they live
  lazer-probe dump            one game state snapshot as JSON
  lazer-probe find <text> [depth]  where in the game's objects a field name, type or value appears
  lazer-probe browse [a.b.c]  fields of the object at a path from the root (no path: the root)
  lazer-probe watch [ms]      game state as JSON lines, printed when it changes
  lazer-probe inputs [ms]     keys and mouse buttons held, printed when they change
  lazer-probe help

LOW LEVEL (reading the managed heap)
  type <dll> <T> | instances <dll> <T> | obj <addr> [filter] | path <addr> <a.b.c> [filter]
  scan <qword> | regions | readbench | peek <addr> [len] | fd <addr> [n] | window

Works with osu!lazer, the tachyon stream and development builds: any process that loads
osu.Game.dll. With several running, pick one with the YAR_GAME_PID environment variable.";

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        None | Some("tui") if std::io::stdout().is_terminal() => tui::run(),
        None | Some("tui") => status::run(false),
        Some("help" | "-h" | "--help") => {
            println!("{HELP}");
            Ok(())
        }
        Some("status") => status::run(args.iter().any(|a| a == "--json")),
        Some("dump") => {
            let mut session = lazer_reader::session::LazerSession::connect()?;
            println!("{}", serde_json::to_string_pretty(&session.snapshot()?)?);
            Ok(())
        }
        Some("find") => explore_cli(|clr, root| {
            let needle = args.get(1).map_or("", String::as_str);
            let depth = args.get(2).and_then(|d| d.parse().ok()).unwrap_or(7);
            let (hits, note) = explorer::search(clr, root, needle, depth);
            for h in &hits {
                println!("{}  [{}]  {}", explorer::show_path(&h.path), h.ty, h.value);
            }
            println!("{} hits; {note}", hits.len());
            Ok(())
        }),
        Some("browse") => explore_cli(|clr, root| {
            let path: Vec<String> = args
                .get(1)
                .map(|p| {
                    p.split('.')
                        .filter(|s| !s.is_empty())
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default();
            let view = explorer::browse(clr, root, &path).map_err(anyhow::Error::msg)?;
            println!("{} @ {:#x}", view.type_name, view.addr);
            for r in view.rows {
                let off = r.offset.map_or_else(String::new, |o| format!("+{o:#05x}"));
                println!("  {off:<7} {:<40} {:<24} {}", r.label, r.ty, r.value);
            }
            Ok(())
        }),
        Some(_) => cli::run(),
    }
}

/// Connects, then runs `f` with the heap reader and the root object.
fn explore_cli(f: impl FnOnce(&lazer_reader::clr::Clr, u64) -> Result<()>) -> Result<()> {
    let mut session = lazer_reader::session::LazerSession::connect()?;
    session.snapshot()?;
    f(session.clr(), session.root_address())
}
