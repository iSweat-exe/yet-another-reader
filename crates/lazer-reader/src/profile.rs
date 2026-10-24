//! Names of the managed fields and types the reader follows, per lazer version.
//!
//! Only *names* live here, never byte offsets: offsets are resolved from the running
//! game through the DAC. So a profile only has to change when ppy renames a field, and
//! it is plain data that can later be shipped through the remote profile source.

use crate::version::LazerVersion;

#[derive(Debug, Clone)]
pub struct Profile {
    /// Human readable origin ("embedded default", later "cache"/"remote").
    pub source: &'static str,
    /// Assembly that holds the game types.
    pub game_dll: &'static str,
    /// Type whose (sub)class instance is the singleton root (`OsuGameDesktop`).
    pub root_type: &'static str,

    pub screen_stack: &'static [&'static str],
    pub beatmap: &'static [&'static str],
    pub ruleset: &'static [&'static str],
    pub selected_mods: &'static [&'static str],
    /// Player -> the mods it plays with (a replay has its own, not the song select's).
    pub player_mods: &'static [&'static str],
    pub playing_state: &'static [&'static str],
    /// Root -> `APIAccess`, then -> the signed-in `APIUser`.
    pub api: &'static [&'static str],
    pub local_user: &'static [&'static str],
    /// Root -> `SpectatorClient` -> `watchingUsers` (a `BindableList<SpectatorUser>`) -> its `List`:
    /// the users watching the signed-in user. Items have `OnlineID` and `Username`.
    pub spectators: &'static [&'static str],
    /// Root -> global `FramedBeatmapClock`.
    pub beatmap_clock: &'static [&'static str],
    /// Player -> `GameplayClockContainer` -> `FramedBeatmapClock`.
    pub gameplay_clock: &'static [&'static str],

    /// Root -> the framework's `ButtonStates<Key>` set: the keyboard keys held down.
    pub input_keys: &'static [&'static str],
    /// Root -> the `ButtonStates<MouseButton>` set: the mouse buttons held down.
    pub input_mouse: &'static [&'static str],

    /// Player -> the ruleset's `KeyBindingContainer`: it holds `pressedActions` (what the player,
    /// or a replay, is pressing) and `KeyBindings` (which keys are bound to which action).
    pub key_bindings: &'static [&'static str],
    /// Player -> the ruleset's `HasReplayLoaded` bindable: true while a replay (or autoplay,
    /// or a spectated player) drives the inputs.
    pub has_replay: &'static [&'static str],
    /// Player -> the actions of the last `ReplayState` the ruleset's input manager applied. Whatever
    /// presses for the player (a replay, Autoplay, Cinema, Relax) goes through it, and the player's own
    /// keys never do: it is what the game itself is pressing. The object changes with every press, so
    /// the path is followed on each read.
    pub replay_actions: &'static [&'static str],

    pub player_type: &'static str,
    pub score_processor: &'static str,
    pub health_processor: &'static str,
}

impl Profile {
    /// Profile for a given lazer build. Every known build currently shares the default.
    #[must_use]
    pub fn for_version(_version: &LazerVersion) -> Self {
        Self::DEFAULT
    }

    pub const DEFAULT: Self = Self {
        source: "embedded default",
        game_dll: "osu.Game.dll",
        root_type: "osu.Game.OsuGame",
        screen_stack: &["<ScreenStack>k__BackingField", "stack"],
        beatmap: &["<Beatmap>k__BackingField", "value"],
        ruleset: &["Ruleset", "value"],
        selected_mods: &["SelectedMods", "value"],
        player_mods: &["<Mods>k__BackingField", "value"],
        playing_state: &["UserPlayingState"],
        api: &["<API>k__BackingField"],
        local_user: &["localUserState", "localUser", "value"],
        spectators: &[
            "<SpectatorClient>k__BackingField",
            "watchingUsers",
            "collection",
        ],
        beatmap_clock: &["beatmapClock"],
        gameplay_clock: &["<GameplayClockContainer>k__BackingField", "GameplayClock"],
        input_keys: &[
            "<Host>k__BackingField",
            "<Root>k__BackingField",
            "CurrentState",
            "Keyboard",
            "Keys",
            "pressedButtons",
        ],
        input_mouse: &[
            "<Host>k__BackingField",
            "<Root>k__BackingField",
            "CurrentState",
            "Mouse",
            "Buttons",
            "pressedButtons",
        ],
        key_bindings: &[
            "<DrawableRuleset>k__BackingField",
            "<KeyBindingInputManager>k__BackingField",
            "KeyBindingContainer",
        ],
        has_replay: &["<DrawableRuleset>k__BackingField", "HasReplayLoaded"],
        replay_actions: &[
            "<DrawableRuleset>k__BackingField",
            "<KeyBindingInputManager>k__BackingField",
            "CurrentState",
            "LastReplayState",
            "PressedActions",
        ],
        player_type: "osu.Game.Screens.Play.Player",
        score_processor: "<ScoreProcessor>k__BackingField",
        health_processor: "<HealthProcessor>k__BackingField",
    };
}
