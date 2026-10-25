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
use crate::graph::GraphWorker;
use crate::input::{Binding, InputState};
use crate::model::{
    Beatmap, GameState, Gameplay, Hits, ModSettings, Paths, PlayingState, Screen, Spectator,
    TimeSource, User,
};
use crate::pp::PpEngine;
use crate::process::Process;
use crate::profile::Profile;
use crate::readers::{
    read_beatmap, read_mod_settings, read_mods, read_spectators, read_time, read_user,
};
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

/// Mods, their settings and the ruleset only change when the player picks something. Outside a play
/// they are re-read this often (a pick shows up within a quarter of a second)...
const SLOW_REFRESH_MENU: Duration = Duration::from_millis(250);
/// ...and during a play (a score's mods are fixed) only this often, or at once when the screen changes.
const SLOW_REFRESH_PLAY: Duration = Duration::from_millis(1500);

/// The user profile changes rarely; re-reading it a few times per minute is plenty.
const USER_REFRESH: Duration = Duration::from_secs(2);
/// Spectators come and go during a play; one cheap read (a short list) per second is enough.
const SPECTATOR_REFRESH: Duration = Duration::from_secs(1);

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
    /// Strain graph of the selected map, computed on its own thread.
    graph: GraphWorker,
    /// `(working beatmap, beatmap info)` addresses and what was read from them.
    beatmap_cache: Option<((u64, u64), Option<Beatmap>)>,
    storage_root: Option<PathBuf>,
    user_cache: Option<(Instant, Option<User>)>,
    spectator_cache: Option<(Instant, Vec<Spectator>, u32)>,
    /// Consecutive snapshots where the root object's header was unreadable.
    root_misses: u32,
    inputs: Option<InputSets>,
    slow: Option<SlowFields>,
    /// The mods of the last snapshot press the keys themselves (see [`Presser`]).
    mods_press: bool,
    /// The full key bindings last seen for each kind of key binding container (see [`complete_bindings`]).
    known_bindings: KnownBindings,
}

/// The fields of a snapshot that rarely change, read again only after a delay or a change of screen.
struct SlowFields {
    at: Instant,
    /// `(visible screen, player)`: a different one means everything is read again.
    key: (u64, u64),
    ruleset: Option<String>,
    mods: Vec<String>,
    settings: ModSettings,
}

/// Addresses of the game's sets of held keys and mouse buttons, and when they were found.
struct InputSets {
    keys: u64,
    mouse: u64,
    /// Field offsets of the two `HashSet` objects, resolved once so a read is a few plain reads.
    keys_layout: CollectionLayout,
    mouse_layout: CollectionLayout,
    /// While a player is on screen: what its ruleset sees pressed. A replay presses actions
    /// without touching the keyboard, so the sets above stay empty.
    gameplay: Option<GameplayInputs>,
    found: Instant,
}

/// Where a `HashSet` / `List` keeps its element count and its backing array.
#[derive(Clone, Copy)]
struct CollectionLayout {
    count: u64,
    array: u64,
}

impl CollectionLayout {
    fn of(clr: &Clr, obj: u64, count: &str, array: &str) -> Result<Self> {
        Ok(Self {
            count: u64::from(clr.field(obj, count)?.offset),
            array: u64::from(clr.field(obj, array)?.offset),
        })
    }
}

/// The ruleset's pressed actions (`List<TAction>`) and the keys bound to each action.
struct GameplayInputs {
    /// The player screen the lists below belong to.
    player: u64,
    /// Field offsets of the `PressedActions` list of a `ReplayState`, learnt on its first read.
    replay_layout: Option<CollectionLayout>,
    pressed: u64,
    pressed_layout: CollectionLayout,
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
        // A development build has no usable version resource: it still reads fine.
        let version = process
            .exe_path()
            .and_then(|exe| read_product_version(&exe))
            .unwrap_or_else(|_| LazerVersion::unknown());
        if let Ok(exe) = process.exe_path() {
            crate::paths::set_running_exe(&exe);
        }
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
            graph: GraphWorker::new(),
            beatmap_cache: None,
            storage_root: crate::pp::storage_root(),
            user_cache: None,
            spectator_cache: None,
            root_misses: 0,
            inputs: None,
            slow: None,
            mods_press: false,
            known_bindings: Vec::new(),
        })
    }

    /// Whether the game process is still running.
    pub fn is_alive(&self) -> bool {
        self.clr.process.is_running()
    }

    /// The attached game process (read-only handle).
    pub fn process(&self) -> &Arc<Process> {
        &self.clr.process
    }

    /// The managed-heap reader, for tools that browse the game's objects.
    pub fn clr(&self) -> &Clr {
        &self.clr
    }

    /// Address of the game's root object (`osu.Game.OsuGame`).
    pub fn root_address(&self) -> u64 {
        self.root
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
            self.inputs = find_input_sets(clr, self.root, &self.profile, &mut self.known_bindings)?;
        }
        let mods_press = self.mods_press;
        let Some(sets) = &mut self.inputs else {
            return Ok(InputState::default());
        };
        let held = match (
            read_hash_set(clr, sets.keys, sets.keys_layout),
            read_hash_set(clr, sets.mouse, sets.mouse_layout),
        ) {
            (Ok(keys), Ok(mouse)) => InputState::from_codes(keys, mouse),
            (Err(e), _) | (_, Err(e)) => {
                self.inputs = None;
                return Err(e);
            }
        };
        let Some(gameplay) = &mut sets.gameplay else {
            return Ok(held);
        };
        let presser = Presser::of(gameplay.replay, mods_press);
        // The player's own keyboard and mouse count only while the player is the one playing.
        let held = if presser == Presser::Player {
            held
        } else {
            InputState::default()
        };
        let actions = match presser {
            // A replay presses the ruleset's own actions, so they are what the game shows.
            Presser::Player | Presser::Replay => {
                read_i32_list(clr, gameplay.pressed, gameplay.pressed_layout).ok()
            }
            // Relax and the other bots without a replay press through the input manager's replay
            // state; the ruleset's list also holds the player's real keys, so it is not used.
            Presser::Mods => read_replay_actions(clr, &self.profile, gameplay),
        };
        match actions {
            Some(actions) => Ok(held.with_actions(
                actions
                    .iter()
                    .filter_map(|a| gameplay.bindings.iter().find(|(id, _)| id == a))
                    .map(|(_, bindings)| bindings.as_slice()),
            )),
            // The player went away between two lookups: look everything up again next time.
            None => {
                self.inputs = None;
                Ok(held)
            }
        }
    }

    /// A human-readable account of how the game's inputs are read right now (for `lazer-probe`): each step of
    /// the path to the replay state, the raw action lists and the replay flag.
    pub fn debug_inputs(&mut self) -> String {
        use std::fmt::Write as _;
        let clr = &self.clr;
        let mut out = String::new();
        let Some(player) = find_player(clr, self.root, &self.profile) else {
            return "no player screen on top of the stack".into();
        };
        let _ = writeln!(
            out,
            "player: {player:#x} {}",
            clr.type_name(clr.object_mt(player).unwrap_or(0))
        );
        let _ = writeln!(
            out,
            "mods press keys: {}  replay flag: {}",
            self.mods_press,
            is_replay(clr, player, &self.profile)
        );
        let mut obj = player;
        for name in self.profile.replay_actions {
            match clr.field_ref(obj, name) {
                Ok(Some(next)) => {
                    let _ = writeln!(
                        out,
                        "  .{name} -> {next:#x} {}",
                        clr.type_name(clr.object_mt(next).unwrap_or(0))
                    );
                    obj = next;
                }
                Ok(None) => {
                    let _ = writeln!(out, "  .{name} -> null");
                    break;
                }
                Err(e) => {
                    let _ = writeln!(out, "  .{name} -> error: {e}");
                    break;
                }
            }
        }
        if let Ok(Some(container)) = clr.follow(player, self.profile.key_bindings)
            && let Ok(Some(pressed)) = clr.field_ref(container, "pressedActions")
        {
            let _ = writeln!(
                out,
                "pressedActions (ruleset): {:?}",
                read_action_list(clr, pressed)
            );
        }
        if let Ok(Some(list)) = clr.follow(player, self.profile.replay_actions) {
            let _ = writeln!(
                out,
                "PressedActions (replay state): {:?}",
                read_action_list(clr, list)
            );
        }
        match find_gameplay_inputs(clr, self.root, &self.profile, &mut self.known_bindings) {
            Some(g) => {
                let _ = writeln!(out, "bindings by action id: {}", g.bindings.len());
                for (id, list) in &g.bindings {
                    let _ = writeln!(
                        out,
                        "  action {id}: {:?}",
                        list.iter().map(|b| (&b.keys, &b.mouse)).collect::<Vec<_>>()
                    );
                }
            }
            None => {
                let _ = writeln!(out, "find_gameplay_inputs: None");
            }
        }
        out
    }

    /// Reads the current game state. An error means the game went away or the layout no
    /// longer matches; the caller should drop the session and reconnect.
    pub fn snapshot(&mut self) -> Result<GameState> {
        if self.clr.object_mt(self.root).is_none() {
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
        }
        self.root_misses = 0;
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

        // A replay plays with the mods of its score, not the ones picked in song select.
        let player = top_screen.filter(|_| state.screen == Screen::Playing);
        let key = (top_screen.unwrap_or(0), player.unwrap_or(0));
        let every = if player.is_some() {
            SLOW_REFRESH_PLAY
        } else {
            SLOW_REFRESH_MENU
        };
        if self
            .slow
            .as_ref()
            .is_none_or(|s| s.key != key || s.at.elapsed() >= every)
        {
            self.slow = Some(read_slow_fields(clr, root, profile, player, key)?);
        }
        let Some(slow) = &self.slow else {
            return Err(ReaderError::Dac("slow fields missing".into()));
        };
        // Flips during a play (breaks), so it is read every time.
        if let Some(b) = clr.follow(root, profile.playing_state)? {
            state.playing = PlayingState::from_raw(clr.i32_field(b, "value").unwrap_or(0));
        }
        state.ruleset.clone_from(&slow.ruleset);
        state.mods.clone_from(&slow.mods);
        let mod_settings = slow.settings;
        self.mods_press = mods_press_keys(&state.mods);
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
        if state.user.is_some() {
            if self
                .spectator_cache
                .as_ref()
                .is_none_or(|(at, ..)| at.elapsed() >= SPECTATOR_REFRESH)
            {
                let (list, total) = read_spectators(clr, root, profile);
                self.spectator_cache = Some((Instant::now(), list, total));
            }
            if let Some((_, list, total)) = &self.spectator_cache {
                state.spectators.clone_from(list);
                state.spectator_count = *total;
            }
        }
        if let Some(map) = &state.beatmap {
            state.difficulty = self
                .pp
                .prepare(&map.sha256, &state.mods, mod_settings)
                .cloned();
            // The graph never blocks the snapshot: it is queued once per (map, mods, rate)
            // and picked up from the cache on a later tick, when the worker is done.
            if let (Some(path), Some(d)) = (&map.paths.beatmap, &state.difficulty) {
                let key = (map.sha256.clone(), state.mods.clone(), mod_settings);
                self.graph.request(&key, PathBuf::from(path), map.length_ms);
                state.difficulty_graph = self.graph.get(&key).map(|mut g| {
                    g.overall = d.stars;
                    g
                });
            }
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

fn read_slow_fields(
    clr: &Clr,
    root: u64,
    profile: &Profile,
    player: Option<u64>,
    key: (u64, u64),
) -> Result<SlowFields> {
    let ruleset = match clr.follow(root, profile.ruleset)? {
        Some(r) => clr
            .string_field(r, "<ShortName>k__BackingField")
            .ok()
            .flatten(),
        None => None,
    };
    let list = match player.and_then(|p| clr.follow(p, profile.player_mods).ok().flatten()) {
        Some(list) => Some(list),
        None => clr.follow(root, profile.selected_mods)?,
    };
    let (mods, settings) = match list {
        Some(list) => (read_mods(clr, list), read_mod_settings(clr, list)),
        None => (Vec::new(), ModSettings::default()),
    };
    Ok(SlowFields {
        at: Instant::now(),
        key,
        ruleset,
        mods,
        settings,
    })
}

/// Who is playing, so which inputs the overlay shows. There is one rule: when the game plays by itself
/// (a replay, or a mod that presses for the player), what it presses is shown and the player's own
/// keyboard and mouse are not; otherwise the player's inputs are.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Presser {
    /// The human: their keys, and the actions they trigger.
    Player,
    /// A replay (or Autoplay, which the game also loads as one): the actions the ruleset is given.
    Replay,
    /// A mod that taps for the player without a replay (Relax): the actions the game applies itself.
    Mods,
}

impl Presser {
    fn of(replay: bool, mods_press: bool) -> Self {
        match (replay, mods_press) {
            (true, _) => Self::Replay,
            (false, true) => Self::Mods,
            (false, false) => Self::Player,
        }
    }
}

/// Whether these mods press the keys instead of the player: Autoplay (`AT`), Cinema (`CN`) and Relax
/// (`RX`, which taps while the ruleset still reports no replay). Only what the game itself presses is
/// shown then (see [`read_replay_actions`]), never the player's own keyboard and mouse. Autopilot (`AP`)
/// only moves the cursor: the clicks stay the player's.
fn mods_press_keys(mods: &[String]) -> bool {
    mods.iter()
        .any(|m| matches!(m.as_str(), "AT" | "CN" | "RX"))
}

/// The bindings seen for each kind of key binding container, as `(container type, bindings by action)`.
type KnownBindings = Vec<(String, Vec<(i32, Vec<Binding>)>)>;

/// osu!'s default buttons as `(OsuAction, key)`: `LeftButton` is `Z`, `RightButton` is `X`.
const OSU_DEFAULT_KEYS: [(i32, &str); 2] = [(0, "Z"), (1, "X")];

fn is_osu_container(kind: &str) -> bool {
    kind.contains(".Rulesets.Osu.")
}

/// Whether the container lets the player's keys trigger gameplay actions. A mod that plays for the player
/// (Relax, Autoplay, Cinema) turns this off, and the container then drops every binding but the
/// non-gameplay ones (osu!'s smoke key): the buttons the game is pressing have no key to show.
fn allows_gameplay_inputs(clr: &Clr, container: u64) -> bool {
    clr.field(container, "allowGameplayInputs")
        .and_then(|f| clr.process.read_bytes(container + u64::from(f.offset), 1))
        // An unreadable flag counts as "allowed": the bindings are then used as they are.
        .map_or_else(|_| true, |b| b.first().is_none_or(|&flag| flag != 0))
}

/// Gives the actions a restricted container no longer lists their keys: the ones seen in an earlier play
/// of the same ruleset (the player's own, custom bindings included), else osu!'s defaults (`Z` and `X`).
/// A container that lists its full bindings is remembered for later.
fn complete_bindings(
    by_action: &mut Vec<(i32, Vec<Binding>)>,
    kind: &str,
    allows_gameplay: bool,
    known: &mut KnownBindings,
) {
    if allows_gameplay {
        if by_action.is_empty() {
            return;
        }
        match known.iter_mut().find(|(k, _)| k == kind) {
            Some((_, saved)) => saved.clone_from(by_action),
            None => known.push((kind.to_owned(), by_action.clone())),
        }
        return;
    }
    let fallback: Vec<(i32, Vec<Binding>)> = match known.iter().find(|(k, _)| k == kind) {
        Some((_, saved)) => saved.clone(),
        None if is_osu_container(kind) => OSU_DEFAULT_KEYS
            .into_iter()
            .map(|(action, key)| {
                (
                    action,
                    vec![Binding {
                        keys: vec![key.to_owned()],
                        mouse: vec![],
                    }],
                )
            })
            .collect(),
        None => Vec::new(),
    };
    for (action, list) in fallback {
        if !by_action.iter().any(|(id, _)| *id == action) {
            by_action.push((action, list));
        }
    }
}

/// Follows the profile's paths to the two `HashSet`s; `None` while the game has no input state.
fn find_input_sets(
    clr: &Clr,
    root: u64,
    profile: &Profile,
    known: &mut KnownBindings,
) -> Result<Option<InputSets>> {
    let keys = clr.follow(root, profile.input_keys)?;
    let mouse = clr.follow(root, profile.input_mouse)?;
    let (Some(keys), Some(mouse)) = (keys, mouse) else {
        return Ok(None);
    };
    Ok(Some(InputSets {
        keys,
        mouse,
        keys_layout: CollectionLayout::of(clr, keys, "_count", "_entries")?,
        mouse_layout: CollectionLayout::of(clr, mouse, "_count", "_entries")?,
        gameplay: find_gameplay_inputs(clr, root, profile, known),
        found: Instant::now(),
    }))
}

/// Follows the visible player to its pressed actions and key bindings; `None` outside gameplay.
fn find_player(clr: &Clr, root: u64, profile: &Profile) -> Option<u64> {
    let stack = clr.follow(root, profile.screen_stack).ok()??;
    let player = *clr.collection_refs(stack, "_array").ok()?.last()?;
    let screen_type = clr.type_name(clr.object_mt(player)?);
    (classify_screen(&screen_type) == Screen::Playing).then_some(player)
}

/// The `List<int>`-like action list at `list`: its elements as raw action numbers.
fn read_action_list(clr: &Clr, list: u64) -> Option<Vec<i32>> {
    let layout = CollectionLayout::of(clr, list, "_size", "_items").ok()?;
    read_i32_list(clr, list, layout).ok()
}

fn find_gameplay_inputs(
    clr: &Clr,
    root: u64,
    profile: &Profile,
    known: &mut KnownBindings,
) -> Option<GameplayInputs> {
    let player = find_player(clr, root, profile)?;
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
    let kind = clr.type_name(clr.object_mt(container)?);
    complete_bindings(
        &mut by_action,
        &kind,
        allows_gameplay_inputs(clr, container),
        known,
    );
    Some(GameplayInputs {
        player,
        replay_layout: None,
        pressed,
        pressed_layout: CollectionLayout::of(clr, pressed, "_size", "_items").ok()?,
        replay: is_replay(clr, player, profile),
        bindings: by_action,
    })
}

/// The actions the game is pressing by itself right now, from the last `ReplayState` its input manager
/// applied (see `Profile::replay_actions`). `None` when that cannot be read, so the caller falls back to
/// the ruleset's `pressedActions`; `Some(empty)` when nothing is pressed (also before the first press).
fn read_replay_actions(
    clr: &Clr,
    profile: &Profile,
    gameplay: &mut GameplayInputs,
) -> Option<Vec<i32>> {
    // A missing `LastReplayState` is normal until something has pressed: nothing is held then.
    let Ok(list) = clr.follow(gameplay.player, profile.replay_actions) else {
        return None;
    };
    let Some(list) = list else {
        return Some(Vec::new());
    };
    let layout = match gameplay.replay_layout {
        Some(layout) => layout,
        None => {
            let layout = CollectionLayout::of(clr, list, "_size", "_items").ok()?;
            gameplay.replay_layout = Some(layout);
            layout
        }
    };
    read_i32_list(clr, list, layout).ok()
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

/// Reads `count` elements of `stride` bytes from the managed array behind `array_ref`, in one read
/// (header included). `None` when the array is shorter than that: the object moved or is garbage.
fn read_elements(
    clr: &Clr,
    array_ref: u64,
    count: usize,
    stride: usize,
) -> Result<Option<Vec<u8>>> {
    if array_ref == 0 {
        return Ok(None);
    }
    // Array layout: method table (8), length (4) + padding (4), then the elements.
    let mut raw = clr.process.read_bytes(array_ref + 8, 8 + count * stride)?;
    let len = u32::from_le_bytes([raw[0], raw[1], raw[2], raw[3]]) as usize;
    if len < count {
        return Err(ReaderError::Dac(
            "collection array is shorter than its count".into(),
        ));
    }
    raw.drain(..8);
    Ok(Some(raw))
}

/// The values of a `List<T>` where `T` is a 4-byte enum, as raw numbers.
fn read_i32_list(clr: &Clr, list: u64, layout: CollectionLayout) -> Result<Vec<i32>> {
    let size = clr.process.read_u32(list + layout.count)? as i32;
    let size = usize::try_from(size)
        .ok()
        .filter(|&n| n <= MAX_HELD_BUTTONS)
        .ok_or_else(|| ReaderError::Dac(format!("implausible action list size {size}")))?;
    if size == 0 {
        return Ok(Vec::new());
    }
    let items = clr.process.read_u64(list + layout.array)?;
    let Some(raw) = read_elements(clr, items, size, 4)? else {
        return Ok(Vec::new());
    };
    Ok(raw
        .as_chunks::<4>()
        .0
        .iter()
        .map(|b| i32::from_le_bytes(*b))
        .collect())
}

/// The values of a `HashSet<T>` where `T` is a 4-byte enum, as raw numbers.
fn read_hash_set(clr: &Clr, set: u64, layout: CollectionLayout) -> Result<Vec<i32>> {
    if clr.object_mt(set).is_none() {
        return Err(ReaderError::Dac(
            "input set is not an object any more".into(),
        ));
    }
    let count = clr.process.read_u32(set + layout.count)? as i32;
    let count = usize::try_from(count)
        .ok()
        .filter(|&n| n <= MAX_HELD_BUTTONS)
        .ok_or_else(|| ReaderError::Dac(format!("implausible input set size {count}")))?;
    if count == 0 {
        return Ok(Vec::new());
    }
    let entries = clr.process.read_u64(set + layout.array)?;
    let Some(raw) = read_elements(clr, entries, count, ENTRY_SIZE)? else {
        return Ok(Vec::new());
    };
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
    #[test]
    fn complete_bindings_should_restore_the_keys_a_restricted_container_dropped() {
        let bind = |k: &str| Binding {
            keys: vec![k.to_owned()],
            mouse: vec![],
        };
        let kind = "osu.Game.Rulesets.Osu.OsuInputManager+OsuKeyBindingContainer";
        let mut known = Vec::new();
        // Relax from the start: osu!'s defaults, the smoke key kept.
        let mut relax = vec![(2, vec![bind("C")])];
        complete_bindings(&mut relax, kind, false, &mut known);
        assert_eq!(relax.len(), 3);
        assert!(relax.iter().any(|(id, l)| *id == 0 && l[0].keys == ["Z"]));
        // A normal play teaches the player's own keys, used by the next Relax play.
        let mut normal = vec![
            (0, vec![bind("A")]),
            (1, vec![bind("S")]),
            (2, vec![bind("C")]),
        ];
        complete_bindings(&mut normal, kind, true, &mut known);
        let mut relax = vec![(2, vec![bind("C")])];
        complete_bindings(&mut relax, kind, false, &mut known);
        assert!(relax.iter().any(|(id, l)| *id == 0 && l[0].keys == ["A"]));
        // Another ruleset has no defaults to give.
        let mut other = vec![];
        complete_bindings(
            &mut other,
            "osu.Game.Rulesets.Taiko.X",
            false,
            &mut Vec::new(),
        );
        assert!(other.is_empty());
    }

    #[test]
    fn presser_should_show_the_game_whenever_it_plays_by_itself() {
        assert_eq!(Presser::of(false, false), Presser::Player);
        assert_eq!(Presser::of(true, false), Presser::Replay);
        assert_eq!(Presser::of(true, true), Presser::Replay);
        assert_eq!(Presser::of(false, true), Presser::Mods);
    }

    #[test]
    fn mods_press_keys_should_cover_the_bots_but_not_autopilot() {
        let mods = |l: &[&str]| l.iter().map(|m| (*m).to_owned()).collect::<Vec<_>>();
        assert!(super::mods_press_keys(&mods(&["HD", "RX"])));
        assert!(super::mods_press_keys(&mods(&["AT"])));
        assert!(super::mods_press_keys(&mods(&["CN"])));
        assert!(!super::mods_press_keys(&mods(&["AP", "DT"])));
        assert!(!super::mods_press_keys(&[]));
    }

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
