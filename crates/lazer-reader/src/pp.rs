//! Star rating and performance points through `rosu-pp`.
//!
//! The `.osu` file is read from lazer's content-addressed file store (the beatmap's
//! SHA-256 is its file name), so nothing here touches the game process.

use std::path::{Path, PathBuf};

use rosu_pp::any::DifficultyAttributes;
use rosu_pp::model::mods::rosu_mods::GameModsIntermode;
use rosu_pp::{Beatmap, Difficulty, GameMods, Performance};

use crate::model::{Difficulty as DifficultyInfo, Hits, ModSettings, Pp};

pub use crate::platform::paths::storage_root;

/// Location of a content-addressed file: `files/<h[0]>/<h[0..2]>/<hash>` in the storage root.
#[must_use]
pub fn store_path(root: &Path, sha256: &str) -> Option<PathBuf> {
    (sha256.len() >= 2 && sha256.is_ascii()).then(|| {
        root.join("files")
            .join(&sha256[..1])
            .join(&sha256[..2])
            .join(sha256)
    })
}

struct Loaded {
    key: (String, Vec<String>, ModSettings),
    map: Beatmap,
    mods: GameMods,
    lazer: bool,
    attrs: DifficultyAttributes,
    info: DifficultyInfo,
}

/// Caches the parsed beatmap and its difficulty for the current (map, mods) pair.
#[derive(Default)]
pub struct PpEngine {
    root: Option<PathBuf>,
    loaded: Option<Loaded>,
    /// Last live result, keyed by the inputs that produced it.
    live: Option<((Hits, u32), f64)>,
}

impl PpEngine {
    #[must_use]
    pub fn new() -> Self {
        Self {
            root: storage_root(),
            ..Self::default()
        }
    }

    /// Loads the beatmap/mods if they changed. Returns the map's difficulty info, or `None`
    /// when the file is unavailable.
    pub fn prepare(
        &mut self,
        sha256: &str,
        mods: &[String],
        settings: ModSettings,
    ) -> Option<&DifficultyInfo> {
        // Compared in place: this runs every snapshot, so no key is built unless something changed.
        let unchanged = self
            .loaded
            .as_ref()
            .is_some_and(|l| l.key.0 == sha256 && l.key.1 == mods && l.key.2 == settings);
        if !unchanged {
            self.live = None;
            self.loaded = self.load((sha256.to_owned(), mods.to_vec(), settings));
        }
        self.loaded.as_ref().map(|l| &l.info)
    }

    fn load(&self, key: (String, Vec<String>, ModSettings)) -> Option<Loaded> {
        let path = store_path(self.root.as_deref()?, &key.0)?;
        let map = Beatmap::from_path(path).ok()?;
        let mods = GameMods::from(GameModsIntermode::from_acronyms(&key.1.join("")));
        // Classic scoring (CL) is what makes lazer behave like stable.
        let lazer = !key.1.iter().any(|m| m == "CL");
        let settings = key.2;
        let attrs = tune_difficulty(Difficulty::new().mods(mods.clone()), settings).calculate(&map);
        let pp_at = |acc: f64| {
            tune_performance(Performance::new(attrs.clone()), &mods, lazer, settings)
                .accuracy(acc)
                .calculate()
                .pp()
        };
        let times = map.hit_objects.iter().map(|o| o.start_time);
        let first = times.clone().reduce(f64::min).unwrap_or(0.0);
        let last = times.reduce(f64::max).unwrap_or(0.0);
        let info = DifficultyInfo {
            stars: attrs.stars(),
            max_combo: attrs.max_combo(),
            pp95: pp_at(95.0),
            pp98: pp_at(98.0),
            pp99: pp_at(99.0),
            pp100: pp_at(100.0),
            first_object_ms: first,
            last_object_ms: last,
        };
        Some(Loaded {
            key,
            map,
            mods,
            lazer,
            attrs,
            info,
        })
    }

    /// PP of the play so far (`live`), if it ended now with a full clear (`fc`) and as an SS.
    pub fn performance(&mut self, hits: Hits, accuracy: f64, max_combo: u32) -> Option<Pp> {
        let loaded = self.loaded.as_ref()?;
        let passed = (hits.great + hits.ok + hits.meh + hits.miss).max(0) as u32;

        let live = match self.live {
            Some((key, pp)) if key == (hits, max_combo) => pp,
            _ => {
                let pp = tune_performance(
                    Performance::new(&loaded.map),
                    &loaded.mods,
                    loaded.lazer,
                    loaded.key.2,
                )
                .passed_objects(passed)
                .n300(hits.great.max(0) as u32)
                .n100(hits.ok.max(0) as u32)
                .n50(hits.meh.max(0) as u32)
                .misses(hits.miss.max(0) as u32)
                .combo(max_combo)
                .calculate()
                .pp();
                self.live = Some(((hits, max_combo), pp));
                pp
            }
        };

        let attrs_pp = |acc: f64| {
            tune_performance(
                Performance::new(loaded.attrs.clone()),
                &loaded.mods,
                loaded.lazer,
                loaded.key.2,
            )
            .accuracy(acc)
        };
        let fc = attrs_pp(accuracy * 100.0).misses(0).calculate().pp();
        let ss = attrs_pp(100.0).calculate().pp();
        Some(Pp { live, fc, ss })
    }
}

/// Applies the speed of the rate mod and the Difficulty Adjust values on top of the mod names,
/// which alone mean a stock DT (1.5x) and the map's own stats.
fn tune_difficulty(mut d: Difficulty, settings: ModSettings) -> Difficulty {
    if let Some(rate) = settings.clock_rate {
        d = d.clock_rate(rate);
    }
    if let Some(da) = settings.difficulty_adjust {
        // `false`: the value replaces the map's stat, and the other mods (DT…) still act on it.
        if let Some(v) = da.cs {
            d = d.cs(v, false);
        }
        if let Some(v) = da.ar {
            d = d.ar(v, false);
        }
        if let Some(v) = da.od {
            d = d.od(v, false);
        }
        if let Some(v) = da.hp {
            d = d.hp(v, false);
        }
    }
    d
}

/// The same overrides as [`tune_difficulty`], for a performance calculation.
fn tune_performance<'a>(
    p: Performance<'a>,
    mods: &GameMods,
    lazer: bool,
    settings: ModSettings,
) -> Performance<'a> {
    let mut p = p.mods(mods.clone()).lazer(lazer);
    if let Some(rate) = settings.clock_rate {
        p = p.clock_rate(rate);
    }
    if let Some(da) = settings.difficulty_adjust {
        if let Some(v) = da.cs {
            p = p.cs(v, false);
        }
        if let Some(v) = da.ar {
            p = p.ar(v, false);
        }
        if let Some(v) = da.od {
            p = p.od(v, false);
        }
        if let Some(v) = da.hp {
            p = p.hp(v, false);
        }
    }
    p
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stars_with(settings: ModSettings) -> f64 {
        let mut osu = String::from(
            "osu file format v14

[General]
Mode: 0

[Difficulty]
HPDrainRate:5
CircleSize:4
OverallDifficulty:8
ApproachRate:9
SliderMultiplier:1.4
SliderTickRate:1

[TimingPoints]
0,333.33,4,2,0,100,1,0

[HitObjects]
",
        );
        for i in 0..200 {
            let (x, y) = (64 + (i * 37) % 384, 64 + (i * 53) % 256);
            osu.push_str(&format!(
                "{x},{y},{},1,0
",
                1000 + i * 150
            ));
        }
        let map = Beatmap::from_bytes(osu.as_bytes()).unwrap();
        let mods = GameMods::from(GameModsIntermode::from_acronyms("DT"));
        tune_difficulty(Difficulty::new().mods(mods), settings)
            .calculate(&map)
            .stars()
    }

    #[test]
    fn tune_difficulty_should_use_the_speed_set_on_the_rate_mod() {
        let stock = stars_with(ModSettings::default());
        let slight = stars_with(ModSettings {
            clock_rate: Some(1.01),
            ..ModSettings::default()
        });
        let explicit = stars_with(ModSettings {
            clock_rate: Some(1.5),
            ..ModSettings::default()
        });
        assert!((stock - explicit).abs() < 1e-9, "a bare DT is 1.5x");
        assert!(slight < stock * 0.8, "DT 1.01x is far easier than DT 1.5x");
    }

    #[test]
    fn store_path_should_shard_by_hash_prefix() {
        let p = store_path(Path::new("root"), "72d855").unwrap();
        assert_eq!(
            p,
            Path::new("root")
                .join("files")
                .join("7")
                .join("72")
                .join("72d855")
        );
    }

    #[test]
    fn store_path_should_reject_short_hashes() {
        assert!(store_path(Path::new("root"), "7").is_none());
    }
}
