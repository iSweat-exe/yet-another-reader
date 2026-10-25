//! Readers that turn pieces of the managed object graph into model types.

use crate::clr::Clr;
use crate::model::{
    Assets, Beatmap, DifficultyAdjust, ModSettings, Paths, Spectator, Time, TimeSource, User,
    UserStatistics,
};
use crate::profile::Profile;

const BACKING: &str = "k__BackingField";

fn backing(name: &str) -> String {
    format!("<{name}>{BACKING}")
}

/// `System.Nullable<int>`: `{ bool hasValue; int value }`.
fn nullable_i32(clr: &Clr, obj: u64, field: &str) -> Option<i32> {
    let at = obj + u64::from(clr.field(obj, field).ok()?.offset);
    let raw = clr.process.read_bytes(at, 8).ok()?;
    (raw[0] != 0).then(|| i32::from_le_bytes([raw[4], raw[5], raw[6], raw[7]]))
}

/// `System.Nullable<decimal>`: `{ bool hasValue; decimal { uint flags; uint hi; ulong lo } }`.
fn nullable_decimal(clr: &Clr, obj: u64, field: &str) -> Option<f64> {
    let at = obj + u64::from(clr.field(obj, field).ok()?.offset);
    let raw = clr.process.read_bytes(at, 24).ok()?;
    if raw[0] == 0 {
        return None;
    }
    let flags = u32::from_le_bytes([raw[8], raw[9], raw[10], raw[11]]);
    let hi = u32::from_le_bytes([raw[12], raw[13], raw[14], raw[15]]);
    let lo = u64::from_le_bytes([
        raw[16], raw[17], raw[18], raw[19], raw[20], raw[21], raw[22], raw[23],
    ]);
    let mantissa = (u128::from(hi) << 64) | u128::from(lo);
    let scale = (flags >> 16) & 0xff;
    let sign = if flags & 0x8000_0000 != 0 { -1.0 } else { 1.0 };
    Some(sign * mantissa as f64 / 10f64.powi(scale as i32))
}

fn follow(clr: &Clr, obj: u64, path: &[&str]) -> Option<u64> {
    clr.follow(obj, path).ok().flatten()
}

fn text(clr: &Clr, obj: u64, name: &str) -> String {
    clr.string_field(obj, name)
        .ok()
        .flatten()
        .unwrap_or_default()
}

fn status_name(raw: i32) -> &'static str {
    match raw {
        -2 => "graveyard",
        -1 => "wip",
        0 => "pending",
        1 => "ranked",
        2 => "approved",
        3 => "qualified",
        4 => "loved",
        _ => "none",
    }
}

/// SHA-256 of the file named `filename` inside a beatmap set's `Files` list.
fn set_file_hash(clr: &Clr, set: u64, filename: &str) -> Option<String> {
    if filename.is_empty() {
        return None;
    }
    let files = clr.field_ref(set, &backing("Files")).ok()??;
    for usage in clr.collection_refs(files, "_items").ok()? {
        if text(clr, usage, &backing("Filename")).eq_ignore_ascii_case(filename) {
            let file = clr.field_ref(usage, &backing("File")).ok()??;
            return clr.string_field(file, &backing("Hash")).ok()?;
        }
    }
    None
}

pub fn read_beatmap(clr: &Clr, working: u64) -> Option<Beatmap> {
    let mt = clr.object_mt(working)?;
    if clr.type_name(mt).contains("Dummy") {
        return None;
    }
    let info = clr.field_ref(working, "BeatmapInfo").ok()??;
    let metadata = clr.field_ref(info, &backing("Metadata")).ok()??;
    let difficulty = clr.field_ref(info, &backing("Difficulty")).ok()??;
    let set = clr.field_ref(working, "BeatmapSetInfo").ok().flatten();

    let creator = clr
        .field_ref(metadata, &backing("Author"))
        .ok()
        .flatten()
        .map(|a| text(clr, a, &backing("Username")))
        .unwrap_or_default();
    let ruleset = clr
        .field_ref(info, &backing("Ruleset"))
        .ok()
        .flatten()
        .map(|r| text(clr, r, &backing("ShortName")))
        .unwrap_or_default();

    let audio_file = text(clr, metadata, &backing("AudioFile"));
    let background_file = text(clr, metadata, &backing("BackgroundFile"));
    let background_sha256 = set.and_then(|s| set_file_hash(clr, s, &background_file));
    let audio_sha256 = set.and_then(|s| set_file_hash(clr, s, &audio_file));

    Some(Beatmap {
        title: text(clr, metadata, &backing("Title")),
        title_unicode: text(clr, metadata, &backing("TitleUnicode")),
        artist: text(clr, metadata, &backing("Artist")),
        artist_unicode: text(clr, metadata, &backing("ArtistUnicode")),
        version: text(clr, info, &backing("DifficultyName")),
        creator,
        source: text(clr, metadata, &backing("Source")),
        tags: text(clr, metadata, &backing("Tags")),
        online_id: clr.i32_field(info, &backing("OnlineID")).unwrap_or(-1),
        set_online_id: set
            .and_then(|s| clr.i32_field(s, &backing("OnlineID")).ok())
            .unwrap_or(-1),
        status: status_name(clr.i32_field(info, &backing("StatusInt")).unwrap_or(-3)).to_owned(),
        ruleset,
        md5: text(clr, info, &backing("MD5Hash")),
        sha256: text(clr, info, &backing("Hash")),
        length_ms: clr.f64_field(info, &backing("Length")).unwrap_or(0.0),
        bpm: clr.f64_field(info, &backing("BPM")).unwrap_or(0.0),
        star_rating: clr.f64_field(info, &backing("StarRating")).unwrap_or(0.0),
        cs: clr
            .f32_field(difficulty, &backing("CircleSize"))
            .unwrap_or(0.0),
        ar: clr
            .f32_field(difficulty, &backing("ApproachRate"))
            .unwrap_or(0.0),
        od: clr
            .f32_field(difficulty, &backing("OverallDifficulty"))
            .unwrap_or(0.0),
        hp: clr
            .f32_field(difficulty, &backing("DrainRate"))
            .unwrap_or(0.0),
        slider_multiplier: clr
            .f64_field(difficulty, &backing("SliderMultiplier"))
            .unwrap_or(0.0),
        slider_tick_rate: clr
            .f64_field(difficulty, &backing("SliderTickRate"))
            .unwrap_or(0.0),
        object_count: clr
            .i32_field(info, &backing("TotalObjectCount"))
            .unwrap_or(0),
        preview_time_ms: clr
            .i32_field(metadata, &backing("PreviewTime"))
            .unwrap_or(-1),
        assets: Assets {
            background: background_sha256.is_some(),
            audio: audio_sha256.is_some(),
        },
        audio_file,
        background_file,
        paths: Paths::default(),
        background_sha256,
        audio_sha256,
    })
}

/// The logged-in user and the statistics lazer last synced for them.
pub fn read_user(clr: &Clr, root: u64, profile: &Profile) -> Option<User> {
    let api = follow(clr, root, profile.api)?;
    let user = follow(clr, api, profile.local_user)?;
    // `APIUser.Id` is 1 for the logged-out guest account.
    let id = clr.i32_field(user, &backing("Id")).ok()?;
    let api_state = follow(clr, api, &["state"])
        .and_then(|s| clr.i32_field(s, "value").ok())
        .map_or("offline", |s| match s {
            1 => "failing",
            2 => "requiresSecondFactorAuth",
            3 => "connecting",
            4 => "online",
            _ => "offline",
        });

    let statistics = clr
        .field_ref(user, "statistics")
        .ok()
        .flatten()
        .map(|s| UserStatistics {
            global_rank: nullable_i32(clr, s, "GlobalRank"),
            country_rank: nullable_i32(clr, s, "CountryRank"),
            pp: nullable_decimal(clr, s, "PP"),
            accuracy: clr.f64_field(s, "Accuracy").unwrap_or(0.0),
            play_count: clr.i32_field(s, "PlayCount").unwrap_or(0),
            total_hits: clr.i32_field(s, "TotalHits").unwrap_or(0),
            max_combo: clr.i32_field(s, "MaxCombo").unwrap_or(0),
            ranked_score: clr.i64_field(s, "RankedScore").unwrap_or(0),
            total_score: clr.i64_field(s, "TotalScore").unwrap_or(0),
        });

    Some(User {
        id,
        username: text(clr, user, &backing("Username")),
        country_code: text(clr, user, "countryCodeString"),
        avatar_url: text(clr, user, "AvatarUrl"),
        api_state: api_state.to_owned(),
        statistics,
    })
}

/// Most spectators kept in the list; the count itself is not capped.
pub const MAX_SPECTATORS: usize = 100;

/// Avatar of an osu! account (`None` for the guest / unknown id).
#[must_use]
pub fn avatar_url(id: i32) -> Option<String> {
    (id > 0).then(|| format!("https://a.ppy.sh/{id}"))
}

/// The users watching the signed-in user: `(list capped at MAX_SPECTATORS, total count)`.
/// Empty when offline or when nobody is watching.
pub fn read_spectators(clr: &Clr, root: u64, profile: &Profile) -> (Vec<Spectator>, u32) {
    let Some(list) = follow(clr, root, profile.spectators) else {
        return (Vec::new(), 0);
    };
    let items = clr.collection_refs(list, "_items").unwrap_or_default();
    let total = u32::try_from(items.len()).unwrap_or(u32::MAX);
    let spectators = items
        .into_iter()
        .take(MAX_SPECTATORS)
        .filter_map(|u| {
            let id = clr.i32_field(u, &backing("OnlineID")).ok()?;
            Some(Spectator {
                id,
                username: text(clr, u, &backing("Username")),
                avatar_url: avatar_url(id),
            })
        })
        .collect();
    (spectators, total)
}

/// Song position from a `FramedBeatmapClock`.
pub fn read_time(clr: &Clr, clock: u64, source: TimeSource) -> Option<Time> {
    let current = follow(clr, clock, &["finalClockSource"])?;
    let current_ms = clr.f64_field(current, &backing("CurrentTime")).ok()?;
    let running = follow(clr, clock, &["decoupledTrack"])
        .and_then(|t| {
            let f = clr.field(t, &backing("IsRunning")).ok()?;
            clr.process.read_bytes(t + u64::from(f.offset), 1).ok()
        })
        .is_some_and(|b| b[0] != 0);
    Some(Time {
        current_ms,
        running,
        source,
    })
}

/// Mod acronyms from the runtime type names of the selected mods.
pub fn read_mods(clr: &Clr, list: u64) -> Vec<String> {
    mod_objects(clr, list)
        .into_iter()
        .filter_map(|m| clr.object_mt(m))
        .map(|mt| mod_acronym(&clr.type_name(mt)))
        .collect()
}

/// The speed and Difficulty Adjust settings of the mods in `list`.
pub fn read_mod_settings(clr: &Clr, list: u64) -> ModSettings {
    let mut settings = ModSettings::default();
    for m in mod_objects(clr, list) {
        // Every rate mod (DT, NC, HT, DC) keeps its speed in a `SpeedChange` setting.
        if let Some(rate) = bindable_f64(clr, m, "<SpeedChange>k__BackingField") {
            settings.clock_rate = Some(rate);
        }
        // Difficulty Adjust: the stats are nullable settings, `null` meaning "keep the map's".
        let is_adjust = clr
            .object_mt(m)
            .is_some_and(|mt| clr.type_name(mt).ends_with("ModDifficultyAdjust"));
        if is_adjust {
            settings.difficulty_adjust = Some(DifficultyAdjust {
                cs: bindable_opt_f32(clr, m, "<CircleSize>k__BackingField"),
                ar: bindable_opt_f32(clr, m, "<ApproachRate>k__BackingField"),
                od: bindable_opt_f32(clr, m, "<OverallDifficulty>k__BackingField"),
                hp: bindable_opt_f32(clr, m, "<DrainRate>k__BackingField"),
            });
        }
    }
    settings
}

/// `value` of the `BindableDouble` in field `name` of `obj`; `None` if there is no such setting.
fn bindable_f64(clr: &Clr, obj: u64, name: &str) -> Option<f64> {
    let bindable = clr.field_ref(obj, name).ok()??;
    clr.f64_field(bindable, "value")
        .ok()
        .filter(|v| v.is_finite())
}

/// `value` of the `BindableNumber<float?>` in field `name` of `obj`; `None` when the setting is
/// missing or null. A `float?` is laid out as `{ bool hasValue; float value }`.
fn bindable_opt_f32(clr: &Clr, obj: u64, name: &str) -> Option<f32> {
    let bindable = clr.field_ref(obj, name).ok()??;
    let at = bindable + u64::from(clr.field(bindable, "value").ok()?.offset);
    let raw = clr.process.read_bytes(at, 8).ok()?;
    (raw[0] != 0)
        .then(|| f32::from_le_bytes([raw[4], raw[5], raw[6], raw[7]]))
        .filter(|v| v.is_finite())
}

/// Addresses of the mod objects in a `List<Mod>` or `Mod[]`.
fn mod_objects(clr: &Clr, list: u64) -> Vec<u64> {
    let Some(mt) = clr.object_mt(list) else {
        return Vec::new();
    };
    let name = clr.type_name(mt);
    if name.starts_with("System.Collections.Generic.List") {
        clr.collection_refs(list, "_items").unwrap_or_default()
    } else if let Some((first, len, 8)) = clr.array_layout(list) {
        clr.process
            .read_bytes(first, len * 8)
            .map(|raw| {
                raw.as_chunks::<8>()
                    .0
                    .iter()
                    .map(|c| u64::from_le_bytes(*c))
                    .collect()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    }
}

#[must_use]
pub fn mod_acronym(type_name: &str) -> String {
    let short = type_name.rsplit('.').next().unwrap_or(type_name);
    // `OsuModHidden` -> `Hidden`: drop the ruleset prefix and the `Mod` marker.
    let bare = short.split_once("Mod").map_or(short, |(_, rest)| rest);
    match bare {
        "Hidden" => "HD",
        "HardRock" => "HR",
        "DoubleTime" => "DT",
        "Nightcore" => "NC",
        "Easy" => "EZ",
        "Flashlight" => "FL",
        "NoFail" => "NF",
        "HalfTime" => "HT",
        "Daycore" => "DC",
        "SuddenDeath" => "SD",
        "Perfect" => "PF",
        "SpunOut" => "SO",
        "TouchDevice" => "TD",
        "Relax" => "RX",
        "Autopilot" => "AP",
        "Classic" => "CL",
        "DifficultyAdjust" => "DA",
        "Autoplay" => "AT",
        "Cinema" => "CN",
        "AccuracyChallenge" => "AC",
        "AdaptiveSpeed" => "AS",
        "Alternate" => "AL",
        "ApproachDifferent" => "AD",
        "BarrelRoll" => "BR",
        "Blinds" => "BL",
        "Bloom" => "BM",
        "Bubbles" => "BU",
        "ConstantSpeed" => "CS",
        "Cover" => "CO",
        "Deflate" => "DF",
        "Depth" => "DP",
        "DualStages" => "DS",
        "FadeIn" => "FI",
        "FloatingFruits" => "FF",
        "FreezeFrame" => "FR",
        "Grow" => "GR",
        "HoldOff" => "HO",
        "Invert" => "IN",
        "Magnetised" => "MG",
        "Mirror" => "MR",
        "MovingFast" => "MF",
        "Muted" => "MU",
        "NoRelease" => "NR",
        "NoScope" => "NS",
        "Random" => "RD",
        "Repel" => "RP",
        "ScoreV2" => "SV2",
        "SimplifiedRhythm" => "SR",
        "SingleTap" => "SG",
        "SpinIn" => "SI",
        "StrictTracking" => "ST",
        "Swap" => "SW",
        "Synesthesia" => "SY",
        "TargetPractice" => "TP",
        "Traceable" => "TC",
        "Transform" => "TR",
        "WindDown" => "WD",
        "WindUp" => "WU",
        "Wiggle" => "WG",
        // The mania key counts: `ManiaModKey4` is `4K`.
        key if key
            .strip_prefix("Key")
            .is_some_and(|n| n.parse::<u8>().is_ok_and(|n| (1..=10).contains(&n))) =>
        {
            return format!("{}K", &key[3..]);
        }
        other => other,
    }
    .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mod_acronym_should_name_every_mod_not_only_the_common_ones() {
        assert_eq!(
            mod_acronym("osu.Game.Rulesets.Osu.Mods.OsuModBarrelRoll"),
            "BR"
        );
        assert_eq!(
            mod_acronym("osu.Game.Rulesets.Mania.Mods.ManiaModKey4"),
            "4K"
        );
        assert_eq!(
            mod_acronym("osu.Game.Rulesets.Mania.Mods.ManiaModKey10"),
            "10K"
        );
        assert_eq!(mod_acronym("osu.Game.Rulesets.Mods.ModWindUp"), "WU");
        assert_eq!(
            mod_acronym("osu.Game.Rulesets.Mods.ModBrandNew"),
            "BrandNew"
        );
    }

    #[test]
    fn mod_acronym_should_strip_ruleset_prefix() {
        assert_eq!(mod_acronym("osu.Game.Rulesets.Osu.Mods.OsuModHidden"), "HD");
        assert_eq!(mod_acronym("osu.Game.Rulesets.Mods.ModDoubleTime"), "DT");
    }

    #[test]
    fn mod_acronym_should_fall_back_to_the_type_name() {
        assert_eq!(
            mod_acronym("osu.Game.Rulesets.Osu.Mods.OsuModSomethingNew"),
            "SomethingNew"
        );
    }

    #[test]
    fn avatar_url_should_be_absent_for_the_guest() {
        assert_eq!(avatar_url(42).as_deref(), Some("https://a.ppy.sh/42"));
        assert_eq!(avatar_url(0), None);
        assert_eq!(avatar_url(-1), None);
    }

    #[test]
    fn status_name_should_map_known_values() {
        assert_eq!(status_name(1), "ranked");
        assert_eq!(status_name(-2), "graveyard");
        assert_eq!(status_name(-3), "none");
    }
}
