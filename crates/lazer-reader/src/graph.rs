//! Difficulty graph: the strain of the selected beatmap over its whole length, as a fixed
//! number of buckets normalised to the map itself (`0` = calmest, `1` = hardest section).
//!
//! `rosu-pp`'s `Difficulty::strains` is not a timeline in the pinned revision (the aim peaks
//! come back sorted by value, speed and reading are per object), so the strain is computed
//! here from the hit objects: a decaying strain fed by tapping speed and jump distance, the
//! shape osu!'s own skills use, in a single pass over the objects (no allocation per object).
//! It runs on a dedicated worker thread, never in the
//! snapshot loop: [`GraphWorker::request`] only queues a job (latest request wins, older
//! queued ones are dropped) and [`GraphWorker::get`] reads the cache. Results are kept per
//! (beatmap, mods, rate) so toggling a mod back is instant.

use std::collections::VecDeque;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::PathBuf;
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex, MutexGuard};

use rosu_pp::Beatmap;
use rosu_pp::model::hit_object::{HitObject, HitObjectKind};
use rosu_pp::model::mode::GameMode;

use crate::model::{DifficultyGraph, ModSettings};

/// Number of buckets in a graph.
pub const BUCKETS: usize = 120;
/// How many (map, mods, rate) results are kept.
const CACHE_SIZE: usize = 8;

/// What a graph depends on: the beatmap file, the mods and their settings.
pub type GraphKey = (String, Vec<String>, ModSettings);

struct Job {
    key: GraphKey,
    path: PathBuf,
    length_ms: f64,
}

#[derive(Default)]
struct Shared {
    /// The key the caller currently wants; a finished job for another key is not published.
    wanted: Option<GraphKey>,
    /// Most recent first. `None` records a map that could not be computed.
    cache: VecDeque<(GraphKey, Option<DifficultyGraph>)>,
}

/// Owns the worker thread; lives in the session (which is single-threaded).
pub struct GraphWorker {
    tx: Sender<Job>,
    shared: Arc<Mutex<Shared>>,
}

fn lock(shared: &Mutex<Shared>) -> MutexGuard<'_, Shared> {
    shared
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl Default for GraphWorker {
    fn default() -> Self {
        Self::new()
    }
}

impl GraphWorker {
    #[must_use]
    pub fn new() -> Self {
        let (tx, rx) = channel();
        let shared = Arc::new(Mutex::new(Shared::default()));
        let worker_shared = Arc::clone(&shared);
        // If the thread cannot start, `get` simply stays `None`: the graph is optional.
        let _ = std::thread::Builder::new()
            .name("lazer-graph".into())
            .spawn(move || worker(&rx, &worker_shared));
        Self { tx, shared }
    }

    /// Asks for the graph of `key`. Cheap: returns at once, the work happens on the worker.
    pub fn request(&self, key: &GraphKey, path: PathBuf, length_ms: f64) {
        let mut shared = lock(&self.shared);
        if shared.wanted.as_ref() == Some(key) {
            return;
        }
        shared.wanted = Some(key.clone());
        if shared.cache.iter().any(|(k, _)| k == key) {
            return;
        }
        drop(shared);
        let _ = self.tx.send(Job {
            key: key.clone(),
            path,
            length_ms,
        });
    }

    /// The finished graph of `key`, if it is ready (and computable).
    #[must_use]
    pub fn get(&self, key: &GraphKey) -> Option<DifficultyGraph> {
        let shared = lock(&self.shared);
        shared
            .cache
            .iter()
            .find(|(k, _)| k == key)
            .and_then(|(_, g)| g.clone())
    }
}

fn worker(rx: &Receiver<Job>, shared: &Mutex<Shared>) {
    // The parsed map is kept so a mod change on the same map does not parse the file again.
    let mut parsed: Option<(PathBuf, Beatmap)> = None;
    while let Ok(mut job) = rx.recv() {
        // Latest request wins: a selection that already moved on is never computed.
        while let Ok(newer) = rx.try_recv() {
            job = newer;
        }
        if lock(shared).wanted.as_ref() != Some(&job.key) {
            continue;
        }
        if parsed.as_ref().is_none_or(|(p, _)| *p != job.path) {
            parsed = Beatmap::from_path(&job.path)
                .ok()
                .map(|m| (job.path.clone(), m));
        }
        let graph = parsed.as_ref().and_then(|(_, map)| {
            catch_unwind(AssertUnwindSafe(|| {
                compute(map, &job.key.1, job.key.2, job.length_ms)
            }))
            .ok()
            .flatten()
        });
        let mut s = lock(shared);
        s.cache.retain(|(k, _)| *k != job.key);
        s.cache.push_front((job.key, graph));
        s.cache.truncate(CACHE_SIZE);
    }
}

/// Speed of the active mods, as the strain sections are laid out in song time with it.
fn rate_of(mods: &[String], settings: ModSettings) -> f64 {
    settings
        .clock_rate
        .unwrap_or_else(|| {
            if mods.iter().any(|m| m == "DT" || m == "NC") {
                1.5
            } else if mods.iter().any(|m| m == "HT" || m == "DC") {
                0.75
            } else {
                1.0
            }
        })
        .clamp(0.1, 10.0)
}

/// The graph of a parsed beatmap with the given mods, or `None` for a map without objects.
#[must_use]
pub fn compute(
    map: &Beatmap,
    mods: &[String],
    settings: ModSettings,
    length_ms: f64,
) -> Option<DifficultyGraph> {
    let last = map.hit_objects.last()?.start_time;
    let duration = length_ms.max(last).max(1.0);
    let has = |m: &str| mods.iter().any(|x| x == m);
    let mut cs = f64::from(map.cs);
    if has("HR") {
        cs = (cs * 1.3).min(10.0);
    } else if has("EZ") {
        cs *= 0.5;
    }
    if let Some(v) = settings.difficulty_adjust.and_then(|d| d.cs) {
        cs = f64::from(v);
    }
    // Circle diameter in osu pixels: distances are measured in circle sizes.
    let diameter = 2.0 * (54.4 - 4.48 * cs.clamp(0.0, 10.0));
    let aims = map.mode == GameMode::Osu || map.mode == GameMode::Catch;
    let strains = strain_buckets(
        &map.hit_objects,
        rate_of(mods, settings),
        duration,
        diameter,
        aims,
    );
    Some(finish(&strains, duration))
}

/// Strain decay per second of real time.
const DECAY_PER_SECOND: f64 = 0.25;
/// Shortest gap between two objects that counts (a 300 BPM stream is 50 ms): stacked notes
/// and chords must not make the strain infinite.
const MIN_GAP_MS: f64 = 25.0;

/// The highest strain reached in each of [`BUCKETS`] equal slices of `0..duration_ms`; a slice
/// without objects holds what is left of the strain after the silence.
fn strain_buckets(
    objects: &[HitObject],
    rate: f64,
    duration_ms: f64,
    diameter: f64,
    aims: bool,
) -> Vec<f64> {
    let bucket_ms = duration_ms / BUCKETS as f64;
    let mut peaks = vec![0.0_f64; BUCKETS];
    let decay = |real_ms: f64| DECAY_PER_SECOND.powf(real_ms.max(0.0) / 1000.0);

    let (mut strain, mut prev_t, mut prev_pos, mut gap) =
        (0.0_f64, f64::NAN, (0.0_f32, 0.0_f32), 1000.0);
    let mut last_bucket = 0;
    for o in objects {
        let t = o.start_time;
        let bucket = ((t / bucket_ms).floor().max(0.0) as usize).min(BUCKETS - 1);
        if prev_t.is_nan() {
            (prev_t, prev_pos) = (t, (o.pos.x, o.pos.y));
            last_bucket = bucket;
            continue;
        }
        // Buckets skipped since the last object only hold the decaying strain.
        for (b, peak) in peaks
            .iter_mut()
            .enumerate()
            .take(bucket)
            .skip(last_bucket + 1)
        {
            let end = (b + 1) as f64 * bucket_ms;
            *peak = strain * decay((end - prev_t) / rate);
        }
        let delta = ((t - prev_t) / rate).max(0.0);
        // Simultaneous objects (stacks, chords) weigh less and reuse the previous gap.
        let weight = match (&o.kind, delta < 1.0) {
            (_, true) | (HitObjectKind::Spinner(_), _) => 0.3,
            (HitObjectKind::Slider(_), _) => 1.25,
            _ => 1.0,
        };
        if delta >= 1.0 {
            gap = delta.max(MIN_GAP_MS);
        }
        let tap = 1000.0 / gap;
        let jump = if aims {
            let (dx, dy) = (
                f64::from(o.pos.x - prev_pos.0),
                f64::from(o.pos.y - prev_pos.1),
            );
            (dx.hypot(dy) / diameter) * tap * 0.6
        } else {
            0.0
        };
        strain = strain * decay(delta) + weight * (tap + jump);
        peaks[bucket] = peaks[bucket].max(strain);
        (prev_t, prev_pos, last_bucket) = (t, (o.pos.x, o.pos.y), bucket);
    }
    // The tail after the last object decays too.
    for (b, peak) in peaks.iter_mut().enumerate().skip(last_bucket + 1) {
        let end = (b + 1) as f64 * bucket_ms;
        *peak = strain * decay((end - prev_t) / rate);
    }
    peaks
}

/// Normalises raw strains to the map's own hardest bucket.
fn finish(strains: &[f64], duration_ms: f64) -> DifficultyGraph {
    let max = strains
        .iter()
        .copied()
        .filter(|v| v.is_finite())
        .fold(0.0_f64, f64::max);
    let buckets: Vec<f32> = strains
        .iter()
        .map(|v| {
            if max > 0.0 && v.is_finite() {
                ((v / max).clamp(0.0, 1.0) * 1000.0).round() as f32 / 1000.0
            } else {
                0.0
            }
        })
        .collect();
    let peak_index = buckets
        .iter()
        .enumerate()
        .fold(
            (0, -1.0_f32),
            |best, (i, &v)| {
                if v > best.1 { (i, v) } else { best }
            },
        )
        .0;
    DifficultyGraph {
        duration_ms,
        overall: 0.0,
        peak_ms: (peak_index as f64 + 0.5) * duration_ms / BUCKETS as f64,
        buckets,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn osu_map(objects: usize, gap_ms: usize) -> Beatmap {
        let mut osu = String::from(
            "osu file format v14\n\n[General]\nMode: 0\n\n[Difficulty]\nHPDrainRate:5\nCircleSize:4\n\
             OverallDifficulty:8\nApproachRate:9\nSliderMultiplier:1.4\nSliderTickRate:1\n\n\
             [TimingPoints]\n0,333.33,4,2,0,100,1,0\n\n[HitObjects]\n",
        );
        let mut t = 1000;
        for i in 0..objects {
            let (x, y) = (64 + (i * 37) % 384, 64 + (i * 53) % 256);
            osu.push_str(&format!(
                "{x},{y},{t},1,0
"
            ));
            // Second half twice as dense, so the graph has something to show.
            t += if i < objects / 2 { gap_ms } else { gap_ms / 2 };
        }
        Beatmap::from_bytes(osu.as_bytes()).unwrap()
    }

    #[test]
    fn compute_should_bound_every_bucket_between_zero_and_one() {
        let g = compute(&osu_map(300, 240), &[], ModSettings::default(), 0.0).unwrap();
        assert_eq!(g.buckets.len(), BUCKETS);
        assert!(g.buckets.iter().all(|v| (0.0..=1.0).contains(v)));
        assert!(g.buckets.contains(&1.0), "normalised to the map's own peak");
    }

    #[test]
    fn compute_should_rate_the_denser_half_higher() {
        let g = compute(&osu_map(400, 300), &[], ModSettings::default(), 0.0).unwrap();
        // 200 objects 300 ms apart, then 200 at 150 ms: 60 s and 30 s, so 2/3 of the buckets.
        let split = BUCKETS * 2 / 3 - 2;
        let first = g.buckets[5..split].iter().sum::<f32>() / (split - 5) as f32;
        let tail = &g.buckets[split + 4..BUCKETS - 1];
        let second = tail.iter().sum::<f32>() / tail.len() as f32;
        assert!(second > first, "{first} vs {second}");
    }

    #[test]
    fn compute_should_handle_short_maps_and_no_objects() {
        let short = compute(&osu_map(3, 300), &[], ModSettings::default(), 5000.0).unwrap();
        assert_eq!(short.buckets.len(), BUCKETS);
        assert!(short.buckets.iter().all(|v| (0.0..=1.0).contains(v)));
        let one = compute(&osu_map(1, 300), &[], ModSettings::default(), 0.0).unwrap();
        assert!(one.buckets.iter().all(|v| (0.0..=1.0).contains(v)));
        assert!(compute(&osu_map(0, 300), &[], ModSettings::default(), 0.0).is_none());
    }

    #[test]
    fn compute_should_follow_the_rate_of_the_mods() {
        let map = osu_map(300, 240);
        let dt = compute(&map, &["DT".into()], ModSettings::default(), 0.0).unwrap();
        assert_eq!(dt.buckets.len(), BUCKETS);
        assert!(dt.buckets.iter().all(|v| (0.0..=1.0).contains(v)));
    }

    #[test]
    fn finish_should_stay_empty_for_flat_or_non_finite_strains() {
        let g = finish(&[0.0; BUCKETS], 4000.0);
        assert!(g.buckets.iter().all(|v| *v == 0.0));
        let mut raw = vec![f64::NAN; BUCKETS];
        raw[3] = 2.0;
        let g = finish(&raw, 4000.0);
        assert!(g.buckets.iter().all(|v| (0.0..=1.0).contains(v)));
        assert!((g.peak_ms - 3.5 * 4000.0 / BUCKETS as f64).abs() < 1e-6);
    }

    #[test]
    fn strain_should_decay_through_a_break() {
        let map = osu_map(100, 150);
        let g = compute(&map, &[], ModSettings::default(), 60_000.0).unwrap();
        let tail = &g.buckets[BUCKETS - 10..];
        assert!(
            tail.windows(2).all(|w| w[1] <= w[0]),
            "calm after the last object"
        );
    }

    #[test]
    fn worker_should_cache_and_publish_only_the_wanted_key() {
        let dir = std::env::temp_dir().join(format!("yar-graph-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("map.osu");
        let mut osu = String::from(
            "osu file format v14\n\n[General]\nMode: 0\n\n[Difficulty]\nCircleSize:4\n\
             OverallDifficulty:8\nApproachRate:9\nSliderMultiplier:1.4\n\n\
             [TimingPoints]\n0,333.33,4,2,0,100,1,0\n\n[HitObjects]\n",
        );
        for i in 0..100 {
            osu.push_str(&format!("{},{},{},1,0\n", 64 + i * 3, 100, 1000 + i * 200));
        }
        std::fs::write(&path, osu).unwrap();

        let w = GraphWorker::new();
        let a: GraphKey = ("a".into(), vec![], ModSettings::default());
        let b: GraphKey = ("b".into(), vec!["HR".into()], ModSettings::default());
        w.request(&a, path.clone(), 0.0);
        w.request(&b, path.clone(), 0.0);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while w.get(&b).is_none() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        assert!(w.get(&b).is_some());
        // Asking again for a finished key is answered from the cache, without a new job.
        w.request(&b, path, 0.0);
        assert!(w.get(&b).is_some());
        let _ = std::fs::remove_dir_all(dir);
    }
}
