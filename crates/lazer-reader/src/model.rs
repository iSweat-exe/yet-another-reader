//! Data model published to overlays. Serialised as camelCase JSON.
//!
//! Everything here is part of the public local API: renaming a field is a breaking change
//! (see `docs/DATA_MODEL.md`).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// State of the connection between this app and osu!lazer.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "phase",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ReaderStatus {
    /// osu!lazer is not running.
    Waiting,
    /// Attached; locating the game's root object (takes a few seconds).
    Connecting,
    Connected {
        version: String,
        profile: String,
        connect_ms: u64,
    },
    /// Running but unreadable (layout changed, DAC refused, ...).
    Error { message: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
    /// `false` while osu!lazer is not running / not readable.
    pub connected: bool,
    pub version: Option<String>,
    pub screen: Screen,
    /// Runtime type name of the top screen, e.g. `osu.Game.Screens.Select.SoloSongSelect`.
    pub screen_type: String,
    pub playing: PlayingState,
    pub ruleset: Option<String>,
    pub mods: Vec<String>,
    /// Playback speed of the active mods (`1.13` for a DT set to 1.13x, `1` without a rate mod).
    pub clock_rate: f64,
    /// Difficulty Adjust overrides, when that mod is active.
    pub difficulty_adjust: Option<DifficultyAdjust>,
    pub beatmap: Option<Beatmap>,
    /// Difficulty with the selected mods; `None` if the `.osu` file could not be read.
    pub difficulty: Option<Difficulty>,
    /// Strain of the beatmap over its length with the selected mods; `None` while it is being
    /// computed (it runs off the reading thread) or if the `.osu` file could not be read.
    pub difficulty_graph: Option<DifficultyGraph>,
    /// Position of the song clock (the gameplay clock while playing).
    pub time: Option<Time>,
    /// The logged-in user, when signed in.
    pub user: Option<User>,
    /// The users spectating the logged-in user's play right now (empty when nobody does, or offline).
    pub spectators: Vec<Spectator>,
    /// Number of spectators (`spectators` is capped, this one is not).
    pub spectator_count: u32,
    /// Only present while a `Player` screen is on top.
    pub gameplay: Option<Gameplay>,
    /// The best completed solo play of the current beatmap that the app has seen (`null` before the first).
    pub personal_best: Option<PersonalBest>,
}

/// The best completed solo play of a beatmap, as seen by the app (plays made before it ran are unknown).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PersonalBest {
    pub score: i64,
    /// Performance points at the end of the play (`0` when they could not be computed).
    pub pp: f64,
    /// 0.0 – 1.0.
    pub accuracy: f64,
    pub max_combo: i32,
    pub mods: Vec<String>,
    /// When the play ended, in milliseconds since the Unix epoch.
    pub played_at: u64,
}

/// A personal best with how it unfolded: one sample per second of song time.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PersonalBestGhost {
    #[serde(flatten)]
    pub best: PersonalBest,
    /// `[songTimeMs, score, pp, accuracy]`, in song-time order.
    pub samples: Vec<[f64; 4]>,
    /// The highest PP of any completed solo play of this beatmap the app has seen, even when a play
    /// with a higher score (and so a different `best`) gave less.
    pub max_pp: f64,
}

/// The values a Difficulty Adjust mod forces; `None` for a stat it leaves alone.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DifficultyAdjust {
    pub cs: Option<f32>,
    pub ar: Option<f32>,
    pub od: Option<f32>,
    pub hp: Option<f32>,
}

/// What the active mods change beyond their name: the playback speed set on a rate mod
/// (DT 1.13x is not DT 1.5x) and the Difficulty Adjust overrides. Feeds the PP calculation.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct ModSettings {
    /// The speed set on a rate mod; `None` when no rate mod is active or it is unreadable.
    pub clock_rate: Option<f64>,
    pub difficulty_adjust: Option<DifficultyAdjust>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum Screen {
    #[default]
    Unknown,
    Menu,
    SongSelect,
    Playing,
    Results,
    Editor,
    Multiplayer,
    Other,
}

/// `osu.Game.Screens.Play.LocalUserPlayingState`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum PlayingState {
    #[default]
    NotPlaying,
    Break,
    Playing,
}

impl PlayingState {
    #[must_use]
    pub fn from_raw(raw: i32) -> Self {
        match raw {
            1 => Self::Break,
            2 => Self::Playing,
            _ => Self::NotPlaying,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Beatmap {
    pub title: String,
    pub title_unicode: String,
    pub artist: String,
    pub artist_unicode: String,
    /// Difficulty name.
    pub version: String,
    pub creator: String,
    pub source: String,
    pub tags: String,
    /// Online beatmap id (`-1` when not submitted).
    pub online_id: i32,
    /// Online beatmap set id (`-1` when not submitted).
    pub set_online_id: i32,
    /// `graveyard`, `wip`, `pending`, `ranked`, `approved`, `qualified`, `loved` or `none`.
    pub status: String,
    /// Short name of the beatmap's own ruleset (`osu`, `taiko`, `fruits`, `mania`).
    pub ruleset: String,
    pub md5: String,
    /// SHA-256 of the `.osu` file (its name in lazer's file store).
    pub sha256: String,
    pub length_ms: f64,
    pub bpm: f64,
    /// Star rating stored by lazer (without the selected mods).
    pub star_rating: f64,
    pub cs: f32,
    pub ar: f32,
    pub od: f32,
    pub hp: f32,
    pub slider_multiplier: f64,
    pub slider_tick_rate: f64,
    pub object_count: i32,
    pub preview_time_ms: i32,
    pub audio_file: String,
    pub background_file: String,
    /// Absolute local paths of the beatmap's files in lazer's storage (`null` if unavailable).
    /// The stored files have no extension; their type is the one of `audioFile`/`backgroundFile`.
    pub paths: Paths,
    /// Which binary assets can be downloaded from `/api/v1/assets/...`.
    pub assets: Assets,
    #[serde(skip)]
    pub background_sha256: Option<String>,
    #[serde(skip)]
    pub audio_sha256: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Paths {
    /// The `.osu` beatmap file.
    pub beatmap: Option<String>,
    pub background: Option<String>,
    pub audio: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Assets {
    pub background: bool,
    pub audio: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Time {
    /// Current position in the song, in milliseconds (negative during the lead-in).
    pub current_ms: f64,
    /// `false` while paused.
    pub running: bool,
    /// `gameplay` while a play is active, otherwise `global` (song select / menu preview).
    pub source: TimeSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum TimeSource {
    #[default]
    Global,
    Gameplay,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Gameplay {
    pub score: i64,
    /// Score without the mod multiplier.
    pub score_without_mods: i64,
    /// 0.0 – 1.0.
    pub accuracy: f64,
    pub combo: i32,
    pub max_combo: i32,
    /// Maximum combo reachable on this beatmap.
    pub beatmap_max_combo: i32,
    /// `F`, `D`, `C`, `B`, `A`, `S`, `SH`, `SS` or `SSH`.
    pub rank: String,
    pub hits: Hits,
    /// Every judgement counter by name (`Great`, `Ok`, `Meh`, `Miss`, `LargeTickHit`, ...).
    pub results: BTreeMap<String, i32>,
    /// 0.0 – 1.0.
    pub health: f64,
    pub paused: bool,
    pub failed: bool,
    pub pp: Option<Pp>,
    pub unstable_rate: Option<f64>,
    /// Most recent hit timing errors in milliseconds (negative = early), oldest first.
    pub hit_errors: Vec<f32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Hits {
    pub great: i32,
    pub ok: i32,
    pub meh: i32,
    pub miss: i32,
}

/// Star rating and PP at common accuracies, with the selected mods applied.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Difficulty {
    pub stars: f64,
    pub max_combo: u32,
    pub pp95: f64,
    pub pp98: f64,
    pub pp99: f64,
    pub pp100: f64,
    /// Song time of the first hit object, in milliseconds: the "00:00" of a timer that ignores the intro.
    pub first_object_ms: f64,
    /// Song time of the last hit object, in milliseconds: the end of that timer (the outro is not counted).
    pub last_object_ms: f64,
}

/// How hard each part of the beatmap is, relative to the rest of the same map.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DifficultyGraph {
    /// Song time covered by `buckets`, in milliseconds (bucket `i` starts at `i * durationMs / n`).
    pub duration_ms: f64,
    /// The overall difficulty: the star rating with the selected mods (same as `difficulty.stars`).
    pub overall: f64,
    /// Song time of the hardest bucket, in milliseconds.
    pub peak_ms: f64,
    /// Strain per bucket, `0.0` (calmest) to `1.0` (the hardest section of this map).
    pub buckets: Vec<f32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Pp {
    /// PP of the play so far.
    pub live: f64,
    /// PP if the play continued at the current accuracy without further misses.
    pub fc: f64,
    /// PP of a perfect play.
    pub ss: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: i32,
    pub username: String,
    pub country_code: String,
    pub avatar_url: String,
    /// `offline`, `failing`, `requiresSecondFactorAuth`, `connecting` or `online`.
    pub api_state: String,
    pub statistics: Option<UserStatistics>,
}

/// A user spectating the logged-in user (`SpectatorClient.WatchingUsers`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Spectator {
    pub id: i32,
    pub username: String,
    /// `https://a.ppy.sh/{id}` for a real account; absent otherwise.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

/// Statistics of the user's main ruleset, as last synced by the game.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UserStatistics {
    pub global_rank: Option<i32>,
    pub country_rank: Option<i32>,
    pub pp: Option<f64>,
    /// 0 – 100.
    pub accuracy: f64,
    pub play_count: i32,
    pub total_hits: i32,
    pub max_combo: i32,
    pub ranked_score: i64,
    pub total_score: i64,
}

#[cfg(test)]
mod spectator_tests {
    use super::*;

    #[test]
    fn spectator_should_omit_a_missing_avatar() {
        let json = serde_json::to_value(Spectator {
            id: 0,
            username: "guest".into(),
            avatar_url: None,
        })
        .unwrap();
        assert!(json.get("avatarUrl").is_none());
    }

    #[test]
    fn game_state_should_serialise_spectators_additively() {
        let json = serde_json::to_value(GameState::default()).unwrap();
        assert_eq!(json["spectators"], serde_json::json!([]));
        assert_eq!(json["spectatorCount"], 0);
    }
}
