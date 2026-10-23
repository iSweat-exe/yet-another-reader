//! High-level reader: attaches to osu!lazer, keeps a handle on the game's root object
//! and turns the live object graph into a [`GameState`].
//!
//! All reads are read-only. The root object is found once by scanning memory for
//! instances of the game class; afterwards each snapshot only follows a few pointers.

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::clr::{Clr, ManagedModule};
use crate::error::{ReaderError, Result};
use crate::input::{Binding, InputState};
use crate::model::{
    Beatmap, GameState, Gameplay, Hits, ModSettings, Paths, PlayingState, Screen, TimeSource, User,
};
use crate::pp::PpEngine;
use crate::process::Process;
use crate::profile::Profile;
use crate::readers::{read_beatmap, read_mod_settings, read_mods, read_time, read_user};
use crate::version::{LazerVersion, read_product_version};

const RECENT_HIT_ERRORS: usize = 128;
/// Consecutive unreadable snapshots before the root object is searched for again.
const ROOT_MISSES_BEFORE_RESCAN: u32 = 45;
/// How long the addresses of the input sets are trusted before they are looked up again.
const INPUT_RESOLVE_EVERY: Duration = Duration::from_millis(250);
/// A `HashSet` of held keys never holds this many entries: more means the read is garbage.
const MAX_HELD_BUTTONS: usize = 512;
/// `HashSet<T>.Entry` for a 4-byte enum: `{ int hashCode; int next; T value }`.
const ENTRY_SIZE: usize = 12;

/// The user profile changes rarely; re-reading it a few times per minute is plenty.
const USER_REFRESH: Duration = Duration::from_secs(2);

// osu.Game.Rulesets.Scoring.HitResult
const RESULT_MISS: i32 = 1;
const RESULT_MEH: i32 = 2;
const RESULT_OK: i32 = 3;
const RESULT_GOOD: i32 = 4;
const RESULT_GREAT: i32 = 5;
const RESULT_PERFECT: i32 = 6;

pub struct LazerSession {
    clr: Clr,
    version: LazerVersion,
    profile: Profile,
    module: ManagedModule,
    root: u64,
    player_mt: Option<u64>,
    hit_events: HitEventTracker,
    pp: PpEngine,
    /// `(working beatmap, beatmap info)` addresses and what was read from them.
    beatmap_cache: Option<((u64, u64), Option<Beatmap>)>,
    storage_root: Option<PathBuf>,
    user_cache: Option<(Instant, Option<User>)>,
    /// Consecutive snapshots where the root object's header was unreadable.
    root_misses: u32,
    inputs: Option<InputSets>,
}

/// Addresses of the game's sets of held keys and mouse buttons, and when they were found.
struct InputSets {
    keys: u64,
    mouse: u64,
    /// While a player is on screen: what its ruleset sees pressed. A replay presses actions
    /// without touching the keyboard, so the sets above stay empty.
    gameplay: Option<GameplayInputs>,
    found: Instant,
}

/// The ruleset's pressed actions (`List<TAction>`) and the keys bound to each action.
struct GameplayInputs {
    pressed: u64,
    /// A replay drives the game: the player's own keyboard and mouse do nothing, so they are
    /// not shown.
    replay: bool,
    /// The bindings of each action, in the order the game lists them.
    bindings: Vec<(i32, Vec<Binding>)>,
}

impl LazerSession {
    /// Attaches to a running osu!lazer and locates the game's root object.
    pub fn connect() -> Result<Self> {
        let process = Arc::new(Process::attach()?);
        let version = read_product_version(&process.exe_path()?)?;
        let profile = Profile::for_version(&version);
        let clr = Clr::attach(process)?;
        let module = clr.managed_module(profile.game_dll)?;
        let root = find_root(&clr, &module, &profile)?;
        let player_mt = clr.method_table_of(&module, profile.player_type);
        Ok(Self {
            clr,
            version,
            profile,
            module,
            root,
            player_mt,
            hit_events: HitEventTracker::default(),
            pp: PpEngine::new(),
            beatmap_cache: None,
            storage_root: crate::pp::storage_root(),
            user_cache: None,
            root_misses: 0,
            inputs: None,
        })
    }

    /// Whether the game process is still running.
    pub fn is_alive(&self) -> bool {
        self.clr.process.is_running()
    }

    pub fn version(&self) -> &LazerVersion {
        &self.version
    }

    pub fn profile(&self) -> &Profile {
        &self.profile
    }

    /// Reads which keys and mouse buttons the game currently sees held down.
    ///
    /// Much cheaper than [`snapshot`](Self::snapshot) (the addresses are remembered between calls),
    /// so it can run hundreds of times per second. An error means the game's input state is not
    /// readable right now; the next call looks the sets up again.
    pub fn read_inputs(&mut self) -> Result<InputState> {
        let clr = &self.clr;
        if self
            .inputs
            .as_ref()
            .is_none_or(|sets| sets.found.elapsed() >= INPUT_RESOLVE_EVERY)
        {
            self.inputs = find_input_sets(clr, self.root, &self.profile)?;
        }
        let Some(sets) = &self.inputs else {
            return Ok(InputState::default());
        };
        let held = match (
            read_hash_set(clr, sets.keys),
            read_hash_set(clr, sets.mouse),
        ) {
            (Ok(keys), Ok(mouse)) => InputState::from_codes(keys, mouse),
            (Err(e), _) | (_, Err(e)) => {
                self.inputs = None;
                return Err(e);
            }
        };
        let Some(gameplay) = &sets.gameplay else {
            return Ok(held);
        };
        let held = if gameplay.replay {
            InputState::default()
        } else {
            held
        };
        match read_i32_list(clr, gameplay.pressed) {
            Ok(actions) => Ok(held.with_actions(
                actions
                    .iter()
                    .filter_map(|a| gameplay.bindings.iter().find(|(id, _)| id == a))
                    .map(|(_, bindings)| bindings.as_slice()),
            )),
            // The player went away between two lookups: the keyboard is still right.
            Err(_) => {
                self.inputs = None;
                Ok(held)
            }
        }
    }

    /// Reads the current game state. An error means the game went away or the layout no
    /// longer matches; the caller should drop the session and reconnect.
    pub fn snapshot(&mut self) -> Result<GameState> {
        if self.clr.object_mt(self.root).is_some() {
            self.root_misses = 0;
        } else {
            // A read can fail for a moment while the GC works. Rescanning the whole heap is
            // costly (and visible as a stutter in the game), so only do it once the object has
            // been gone for a while: it moved (rare gen2 compaction) or the game restarted.
            self.root_misses += 1;
            if self.root_misses < ROOT_MISSES_BEFORE_RESCAN {
                return Err(ReaderError::Dac(
                    "root object is temporarily unreadable".into(),
                ));
            }
            self.root = find_root(&self.clr, &self.module, &self.profile)?;
            self.root_misses = 0;
        }
        let root = self.root;
        let clr = &self.clr;
        let profile = &self.profile;

        let mut state = GameState {
            connected: true,
            version: Some(self.version.to_string()),
            ..GameState::default()
        };

        // Screen stack: the last element is the visible screen.
        let mut top_screen = None;
        if let Some(stack) = clr.follow(root, profile.screen_stack)? {
            top_screen = clr.collection_refs(stack, "_array")?.last().copied();
        }
        if let Some(mt) = top_screen.and_then(|s| clr.object_mt(s)) {
            state.screen_type = clr.type_name(mt);
            state.screen = classify_screen(&state.screen_type);
        }

        if let Some(b) = clr.follow(root, profile.playing_state)? {
            state.playing = PlayingState::from_raw(clr.i32_field(b, "value").unwrap_or(0));
        }
        if let Some(r) = clr.follow(root, profile.ruleset)? {
            state.ruleset = clr
                .string_field(r, "<ShortName>k__BackingField")
                .ok()
                .flatten();
        }
        // A replay plays with the mods of its score, not the ones picked in song select.
        let player = top_screen.filter(|_| state.screen == Screen::Playing);
        let mods_list = match player.and_then(|p| clr.follow(p, profile.player_mods).ok().flatten())
        {
            Some(list) => Some(list),
            None => clr.follow(root, profile.selected_mods)?,
        };
        let mut mod_settings = ModSettings::default();
        if let Some(list) = mods_list {
            state.mods = read_mods(clr, list);
            mod_settings = read_mod_settings(clr, list);
        }
        state.clock_rate = mod_settings
            .clock_rate
            .unwrap_or_else(|| default_clock_rate(&state.mods));
        state.difficulty_adjust = mod_settings.difficulty_adjust;
        if let Some(wb) = clr.follow(root, profile.beatmap)? {
            let key = (
                wb,
                clr.field_ref(wb, "BeatmapInfo").ok().flatten().unwrap_or(0),
            );
            match &self.beatmap_cache {
                Some((k, map)) if *k == key => state.beatmap = map.clone(),
                _ => {
                    state.beatmap = read_beatmap(clr, wb).map(|mut b| {
                        b.paths = file_paths(self.storage_root.as_deref(), &b);
                        b
                    });
                    self.beatmap_cache = Some((key, state.beatmap.clone()));
                }
            }
        }

        if self
            .user_cache
            .as_ref()
            .is_none_or(|(at, _)| at.elapsed() >= USER_REFRESH)
        {
            self.user_cache = Some((Instant::now(), read_user(clr, root, profile)));
        }
        state.user = self.user_cache.as_ref().and_then(|(_, u)| u.clone());
        if let Some(map) = &state.beatmap {
            state.difficulty = self
                .pp
                .prepare(&map.sha256, &state.mods, mod_settings)
                .cloned();
        }

        state.time = match player.and_then(|p| clr.follow(p, profile.gameplay_clock).ok().flatten())
        {
            Some(clock) => read_time(clr, clock, TimeSource::Gameplay),
            None => clr
                .follow(root, profile.beatmap_clock)?
                .and_then(|c| read_time(clr, c, TimeSource::Global)),
        };

        if state.screen == Screen::Playing {
            if let Some(player) = player {
                state.gameplay = read_gameplay(
                    clr,
                    &self.module,
                    profile,
                    self.player_mt,
                    player,
                    &mut self.hit_events,
                    &mut self.pp,
                )
                .ok()
                .flatten();
            }
        } else {
            self.hit_events.reset(0);
        }
        Ok(state)
    }
}

/// Follows the profile's paths to the two `HashSet`s; `None` while the game has no input state.
fn find_input_sets(clr: &Clr, root: u64, profile: &Profile) -> Result<Option<InputSets>> {
    let keys = clr.follow(root, profile.input_keys)?;
    let mouse = clr.follow(root, profile.input_mouse)?;
    Ok(keys.zip(mouse).map(|(keys, mouse)| InputSets {
        keys,
        mouse,
        gameplay: find_gameplay_inputs(clr, root, profile),
        found: Instant::now(),
    }))
}

/// Follows the visible player to its pressed actions and key bindings; `None` outside gameplay.
fn find_gameplay_inputs(clr: &Clr, root: u64, profile: &Profile) -> Option<GameplayInputs> {
    let stack = clr.follow(root, profile.screen_stack).ok()??;
    let player = *clr.collection_refs(stack, "_array").ok()?.last()?;
    let screen_type = clr.type_name(clr.object_mt(player)?);
    if classify_screen(&screen_type) != Screen::Playing {
        return None;
    }
    let container = clr.follow(player, profile.key_bindings).ok()??;
    let pressed = clr.field_ref(container, "pressedActions").ok()??;
    let bindings = clr
        .field_ref(container, "KeyBindings")
        .ok()?
        .map(|list| clr.collection_refs(list, "_items").unwrap_or_default())
        .unwrap_or_default();
    let mut by_action: Vec<(i32, Vec<Binding>)> = Vec::new();
    for binding in bindings {
        let Ok(action) = clr.i32_field(binding, "<ActionInt>k__BackingField") else {
            continue;
        };
        let combination = clr
            .string_field(binding, "<KeyCombinationString>k__BackingField")
            .ok()
            .flatten()
            .unwrap_or_default();
        let (keys, mouse) = crate::input::binding_inputs(&combination);
        if keys.is_empty() && mouse.is_empty() {
            continue;
        }
        let entry = Binding { keys, mouse };
        match by_action.iter_mut().find(|(id, _)| *id == action) {
            Some((_, list)) => list.push(entry),
            None => by_action.push((action, vec![entry])),
        }
    }
    Some(GameplayInputs {
        pressed,
        replay: is_replay(clr, player, profile),
        bindings: by_action,
    })
}

/// Whether the player's ruleset is replaying a score rather than reading the player's inputs.
fn is_replay(clr: &Clr, player: u64, profile: &Profile) -> bool {
    let Ok(Some(flag)) = clr.follow(player, profile.has_replay) else {
        return false;
    };
    clr.field(flag, "value")
        .and_then(|f| clr.process.read_bytes(flag + u64::from(f.offset), 1))
        .is_ok_and(|b| b[0] != 0)
}

/// The values of a `List<T>` where `T` is a 4-byte enum, as raw numbers.
fn read_i32_list(clr: &Clr, list: u64) -> Result<Vec<i32>> {
    let size = clr.i32_field(list, "_size")?;
    let size = usize::try_from(size)
        .ok()
        .filter(|&n| n <= MAX_HELD_BUTTONS)
        .ok_or_else(|| ReaderError::Dac(format!("implausible action list size {size}")))?;
    if size == 0 {
        return Ok(Vec::new());
    }
    let Some(items) = clr.field_ref(list, "_items")? else {
        return Ok(Vec::new());
    };
    let Some((first, len, 4)) = clr.array_layout(items) else {
        return Err(ReaderError::Dac("unexpected action list layout".into()));
    };
    let raw = clr.process.read_bytes(first, size.min(len) * 4)?;
    Ok(raw
        .as_chunks::<4>()
        .0
        .iter()
        .map(|b| i32::from_le_bytes(*b))
        .collect())
}

/// The values of a `HashSet<T>` where `T` is a 4-byte enum, as raw numbers.
fn read_hash_set(clr: &Clr, set: u64) -> Result<Vec<i32>> {
    let count = clr.i32_field(set, "_count")?;
    let count = usize::try_from(count)
        .ok()
        .filter(|&n| n <= MAX_HELD_BUTTONS)
        .ok_or_else(|| ReaderError::Dac(format!("implausible input set size {count}")))?;
    if count == 0 {
        return Ok(Vec::new());
    }
    let Some(entries) = clr.field_ref(set, "_entries")? else {
        return Ok(Vec::new());
    };
    let Some((first, len, ENTRY_SIZE)) = clr.array_layout(entries) else {
        return Err(ReaderError::Dac("unexpected input set layout".into()));
    };
    let raw = clr.process.read_bytes(first, count.min(len) * ENTRY_SIZE)?;
    // `_count` includes freed slots; those have `next` below -1 and are skipped.
    Ok(raw
        .as_chunks::<ENTRY_SIZE>()
        .0
        .iter()
        .filter(|e| i32::from_le_bytes([e[4], e[5], e[6], e[7]]) >= -1)
        .map(|e| i32::from_le_bytes([e[8], e[9], e[10], e[11]]))
        .collect())
}

/// Absolute paths of a beatmap's files inside lazer's content-addressed store.
fn file_paths(root: Option<&Path>, map: &Beatmap) -> Paths {
    let path = |sha: Option<&str>| {
        let p = crate::pp::store_path(root?, sha?)?;
        p.is_file().then(|| p.to_string_lossy().into_owned())
    };
    Paths {
        beatmap: path(Some(&map.sha256)),
        background: path(map.background_sha256.as_deref()),
        audio: path(map.audio_sha256.as_deref()),
    }
}

fn find_root(clr: &Clr, module: &ManagedModule, profile: &Profile) -> Result<u64> {
    let base = clr
        .method_table_of(module, profile.root_type)
        .ok_or_else(|| ReaderError::Dac(format!("{} is not loaded", profile.root_type)))?;
    let types: HashMap<u64, String> = clr.subclasses_of(base)?.into_iter().collect();
    let hits = clr.scan_for_qwords(&types.keys().copied().collect());
    for (addr, mt) in hits {
        if clr
            .layout_of(mt)
            .is_ok_and(|layout| clr.looks_like_object(addr, &layout))
        {
            return Ok(addr);
        }
    }
    Err(ReaderError::Dac(format!(
        "no live {} instance found",
        profile.root_type
    )))
}

/// The speed a rate mod gives when its setting could not be read.
fn default_clock_rate(mods: &[String]) -> f64 {
    if mods.iter().any(|m| m == "DT" || m == "NC") {
        1.5
    } else if mods.iter().any(|m| m == "HT" || m == "DC") {
        0.75
    } else {
        1.0
    }
}

fn classify_screen(type_name: &str) -> Screen {
    let short = type_name.rsplit('.').next().unwrap_or(type_name);
    if type_name.starts_with("osu.Game.Screens.Play.") && short.ends_with("Player") {
        Screen::Playing
    } else if short.contains("SongSelect") {
        Screen::SongSelect
    } else if short.contains("Results") {
        Screen::Results
    } else if type_name.contains(".Screens.Edit.") {
        Screen::Editor
    } else if type_name.contains(".Multiplayer.") || type_name.contains(".Playlists.") {
        Screen::Multiplayer
    } else if type_name.contains(".Screens.Menu.") {
        Screen::Menu
    } else {
        Screen::Other
    }
}

fn read_gameplay(
    clr: &Clr,
    module: &ManagedModule,
    profile: &Profile,
    player_mt: Option<u64>,
    player: u64,
    tracker: &mut HitEventTracker,
    pp: &mut PpEngine,
) -> Result<Option<Gameplay>> {
    let derives = match (player_mt, clr.object_mt(player)) {
        (Some(base), Some(mt)) => clr.derives_from(mt, base),
        _ => false,
    };
    if !derives {
        return Ok(None);
    }
    let Some(sp) = clr.field_ref(player, profile.score_processor)? else {
        return Ok(None);
    };
    if tracker.player != player {
        tracker.reset(player);
    }

    let bindable_i64 = |name: &str| -> Result<i64> {
        let b = clr
            .field_ref(sp, name)?
            .ok_or_else(|| ReaderError::Dac(format!("{name} is null")))?;
        clr.i64_field(b, "value")
    };
    let bindable_i32 = |obj: u64, name: &str| -> Result<i32> {
        let b = clr
            .field_ref(obj, name)?
            .ok_or_else(|| ReaderError::Dac(format!("{name} is null")))?;
        clr.i32_field(b, "value")
    };
    let bindable_f64 = |obj: u64, name: &str| -> Result<f64> {
        let b = clr
            .field_ref(obj, name)?
            .ok_or_else(|| ReaderError::Dac(format!("{name} is null")))?;
        clr.f64_field(b, "value")
    };

    let counts = clr
        .field_ref(sp, "ScoreResultCounts")?
        .map(|d| read_result_counts(clr, d))
        .unwrap_or_default();
    let count = |r: i32| counts.get(&r).copied().unwrap_or(0);

    let health = match clr.field_ref(player, profile.health_processor)? {
        Some(hp) => bindable_f64(hp, "Health").unwrap_or(1.0),
        None => 1.0,
    };

    if let Some(events) = clr.field_ref(sp, "hitEvents")? {
        tracker.ingest(clr, module, events);
    }

    let accuracy = bindable_f64(sp, "Accuracy")?;
    let max_combo = bindable_i32(sp, "HighestCombo")?;
    let hits = Hits {
        great: count(RESULT_GREAT) + count(RESULT_PERFECT),
        ok: count(RESULT_OK) + count(RESULT_GOOD),
        meh: count(RESULT_MEH),
        miss: count(RESULT_MISS),
    };

    let flag = |obj: u64, field: &str| -> bool {
        clr.field(obj, field)
            .ok()
            .and_then(|f| clr.process.read_bytes(obj + u64::from(f.offset), 1).ok())
            .is_some_and(|b| b[0] != 0)
    };
    let health_processor = clr.field_ref(player, profile.health_processor)?;
    let paused = clr
        .follow(
            player,
            &["<GameplayClockContainer>k__BackingField", "isPaused"],
        )?
        .is_some_and(|b| flag(b, "value"));
    let rank = clr
        .field_ref(sp, "rank")?
        .and_then(|b| clr.i32_field(b, "value").ok())
        .map_or("F", rank_name);

    Ok(Some(Gameplay {
        score: bindable_i64("TotalScore")?,
        score_without_mods: bindable_i64("TotalScoreWithoutMods").unwrap_or(0),
        beatmap_max_combo: clr
            .i32_field(sp, "<MaximumCombo>k__BackingField")
            .unwrap_or(0),
        rank: rank.to_owned(),
        results: counts
            .iter()
            .map(|(&id, &n)| (result_name(id), n))
            .collect::<BTreeMap<_, _>>(),
        paused,
        failed: health_processor.is_some_and(|h| flag(h, "<HasFailed>k__BackingField")),
        accuracy,
        combo: bindable_i32(sp, "Combo")?,
        max_combo,
        hits,
        pp: pp.performance(hits, accuracy, max_combo.max(0) as u32),
        health,
        unstable_rate: tracker.unstable_rate(),
        hit_errors: tracker.recent.iter().copied().collect(),
    }))
}

/// `osu.Game.Scoring.ScoreRank`.
fn rank_name(raw: i32) -> &'static str {
    match raw {
        0 => "D",
        1 => "C",
        2 => "B",
        3 => "A",
        4 => "S",
        5 => "SH",
        6 => "SS",
        7 => "SSH",
        _ => "F",
    }
}

/// `osu.Game.Rulesets.Scoring.HitResult`.
fn result_name(id: i32) -> String {
    match id {
        0 => "None",
        1 => "Miss",
        2 => "Meh",
        3 => "Ok",
        4 => "Good",
        5 => "Great",
        6 => "Perfect",
        7 => "SmallTickMiss",
        8 => "SmallTickHit",
        9 => "LargeTickMiss",
        10 => "LargeTickHit",
        11 => "SmallBonus",
        12 => "LargeBonus",
        13 => "IgnoreMiss",
        14 => "IgnoreHit",
        15 => "ComboBreak",
        16 => "SliderTailHit",
        99 => "LegacyComboIncrease",
        other => return format!("Result{other}"),
    }
    .to_owned()
}

/// `Dictionary<HitResult, int>` -> `result -> count`.
fn read_result_counts(clr: &Clr, dict: u64) -> HashMap<i32, i32> {
    let mut out = HashMap::new();
    let (Ok(Some(entries)), Ok(used)) = (
        clr.field_ref(dict, "_entries"),
        clr.i32_field(dict, "_count"),
    ) else {
        return out;
    };
    // Entry<TKey, TValue> = { uint hashCode; int next; TKey key; TValue value } = 16 bytes for (int, int).
    let Some((first, len, 16)) = clr.array_layout(entries) else {
        return out;
    };
    let n = (used.max(0) as usize).min(len);
    let Ok(raw) = clr.process.read_bytes(first, n * 16) else {
        return out;
    };
    for e in raw.as_chunks::<16>().0 {
        let next = i32::from_le_bytes([e[4], e[5], e[6], e[7]]);
        if next >= -1 {
            let key = i32::from_le_bytes([e[8], e[9], e[10], e[11]]);
            out.insert(key, i32::from_le_bytes([e[12], e[13], e[14], e[15]]));
        }
    }
    out
}

/// Incrementally reads `List<HitEvent>` and keeps running timing statistics.
#[derive(Default)]
struct HitEventTracker {
    player: u64,
    seen: usize,
    count: u64,
    mean: f64,
    m2: f64,
    recent: std::collections::VecDeque<f32>,
}

impl HitEventTracker {
    fn reset(&mut self, player: u64) {
        *self = Self {
            player,
            ..Self::default()
        };
    }

    fn unstable_rate(&self) -> Option<f64> {
        (self.count > 1).then(|| 10.0 * (self.m2 / self.count as f64).sqrt())
    }

    fn ingest(&mut self, clr: &Clr, module: &ManagedModule, list: u64) {
        let Ok(size) = clr.i32_field(list, "_size") else {
            return;
        };
        let size = size.max(0) as usize;
        if size < self.seen {
            self.reset(self.player);
        }
        if size == self.seen {
            return;
        }
        let Some(event_mt) = clr.method_table_of(module, "osu.Game.Rulesets.Scoring.HitEvent")
        else {
            return;
        };
        let Ok(layout) = clr.layout_of(event_mt) else {
            return;
        };
        let (Some(time), Some(result)) = (layout.get("TimeOffset"), layout.get("Result")) else {
            return;
        };
        // Field offsets of a boxed value type include the 8-byte header; array elements don't have one.
        let (time_off, result_off) = (u64::from(time.offset) - 8, u64::from(result.offset) - 8);

        let Ok(Some(items)) = clr.field_ref(list, "_items") else {
            return;
        };
        let Some((first, len, stride)) = clr.array_layout(items) else {
            return;
        };
        for i in self.seen..size.min(len) {
            let at = first + (i * stride) as u64;
            let (Ok(offset), Ok(res)) = (
                clr.process.read_f64(at + time_off),
                clr.process.read_u32(at + result_off),
            ) else {
                return;
            };
            self.seen = i + 1;
            if (RESULT_MEH..=RESULT_PERFECT).contains(&(res as i32)) && offset.is_finite() {
                self.count += 1;
                let delta = offset - self.mean;
                self.mean += delta / self.count as f64;
                self.m2 += delta * (offset - self.mean);
                if self.recent.len() == RECENT_HIT_ERRORS {
                    self.recent.pop_front();
                }
                self.recent.push_back(offset as f32);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_screen_should_detect_player_subclasses() {
        assert_eq!(
            classify_screen("osu.Game.Screens.Play.SoloPlayer"),
            Screen::Playing
        );
        assert_eq!(
            classify_screen("osu.Game.Screens.Play.ReplayPlayer"),
            Screen::Playing
        );
    }

    #[test]
    fn classify_screen_should_not_treat_player_overlays_as_playing() {
        assert_eq!(
            classify_screen("osu.Game.Screens.Play.PlayerLoader"),
            Screen::Other
        );
    }

    #[test]
    fn classify_screen_should_recognise_menu_and_song_select() {
        assert_eq!(
            classify_screen("osu.Game.Screens.Select.SoloSongSelect"),
            Screen::SongSelect
        );
        assert_eq!(
            classify_screen("osu.Game.Screens.Menu.MainMenu"),
            Screen::Menu
        );
        assert_eq!(
            classify_screen("osu.Game.Screens.Ranking.SoloResultsScreen"),
            Screen::Results
        );
    }

    #[test]
    fn unstable_rate_should_be_ten_times_the_standard_deviation() {
        let mut t = HitEventTracker::default();
        for offset in [-10.0_f64, 10.0] {
            t.count += 1;
            let delta = offset - t.mean;
            t.mean += delta / t.count as f64;
            t.m2 += delta * (offset - t.mean);
        }
        assert!((t.unstable_rate().unwrap() - 100.0).abs() < 1e-9);
    }

    #[test]
    fn unstable_rate_should_be_none_without_enough_hits() {
        assert_eq!(HitEventTracker::default().unstable_rate(), None);
    }
}
