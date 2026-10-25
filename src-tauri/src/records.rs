//! Personal bests: the best completed solo play of each beatmap the app has watched.
//!
//! The game keeps its own scores in a database this app does not read (read-only on the process, and
//! the scores live on disk in Realm), so the record is built from what the reader sees: while a solo
//! play runs one sample per second is kept, and when it ends on the results screen it replaces the
//! stored record if its score is higher. A widget can then compare a live play with the record at the
//! same point of the song. Plays made before the app was installed are not known.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use lazer_reader::model::{GameState, Gameplay, PersonalBest, PersonalBestGhost, Screen};
use overlay_server::Hub;

/// Song time between two samples of the play being recorded, in milliseconds.
const SAMPLE_MS: f64 = 1000.0;
/// A song clock this far behind the last sample means the play was restarted.
const RESTART_MS: f64 = 2000.0;
/// Type name of the screen of a normal solo play (replays and spectating have other names).
const SOLO_PLAYER: &str = ".SoloPlayer";

pub struct Records {
    dir: PathBuf,
    hub: Hub,
    /// SHA-256 of the beatmap whose record is loaded.
    map: Option<String>,
    best: Option<Arc<PersonalBestGhost>>,
    samples: Vec<[f64; 4]>,
}

/// File of a beatmap's record; `None` for a hash that is not hexadecimal (it ends up in a file name).
fn file_for(dir: &Path, sha256: &str) -> Option<PathBuf> {
    (!sha256.is_empty() && sha256.bytes().all(|b| b.is_ascii_hexdigit()))
        .then(|| dir.join(format!("{}.json", sha256.to_ascii_lowercase())))
}

fn load(dir: &Path, sha256: &str) -> Option<PersonalBestGhost> {
    let text = std::fs::read_to_string(file_for(dir, sha256)?).ok()?;
    let mut ghost: PersonalBestGhost = serde_json::from_str(&text).ok()?;
    // Records written before `max_pp` existed only know their own play, which is a lower bound.
    ghost.max_pp = ghost.max_pp.max(ghost.best.pp);
    Some(ghost)
}

fn save(dir: &Path, sha256: &str, ghost: &PersonalBestGhost) -> std::io::Result<()> {
    let Some(path) = file_for(dir, sha256) else {
        return Ok(());
    };
    std::fs::create_dir_all(dir)?;
    std::fs::write(path, serde_json::to_string(ghost)?)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

fn is_solo(state: &GameState) -> bool {
    state.screen_type.ends_with(SOLO_PLAYER)
}

fn sample(t: f64, play: &Gameplay) -> [f64; 4] {
    [
        t,
        play.score as f64,
        play.pp.as_ref().map_or(0.0, |p| p.live),
        play.accuracy,
    ]
}

impl Records {
    pub fn new(dir: PathBuf, hub: Hub) -> Self {
        Self {
            dir,
            hub,
            map: None,
            best: None,
            samples: Vec::new(),
        }
    }

    /// Looks at the state about to be published: records the play in progress, saves a new record
    /// when a play just ended, and fills in `state.personal_best`.
    pub fn observe(&mut self, prev: Option<&GameState>, state: &mut GameState) {
        let sha = state.beatmap.as_ref().map(|b| b.sha256.clone());
        if sha != self.map {
            self.best = sha
                .as_deref()
                .and_then(|s| load(&self.dir, s))
                .map(Arc::new);
            self.hub.set_ghost(self.best.clone());
            self.map = sha;
            self.samples.clear();
        }

        if let Some(play) = state.gameplay.as_ref().filter(|_| is_solo(state)) {
            let t = state.time.as_ref().map_or(0.0, |t| t.current_ms);
            let last = self.samples.last().map(|s| s[0]);
            if last.is_some_and(|l| t < l - RESTART_MS) {
                self.samples.clear();
            }
            if self.samples.last().is_none_or(|l| t >= l[0] + SAMPLE_MS) {
                self.samples.push(sample(t, play));
            }
        } else if let Some(prev) = prev
            && prev.gameplay.is_some()
            && state.gameplay.is_none()
        {
            self.finish(prev, state.screen);
        }

        state.personal_best = self.best.as_ref().map(|g| g.best.clone());
    }

    /// A play just left the screen: keep it when it was a completed solo play with a better score.
    fn finish(&mut self, prev: &GameState, next_screen: Screen) {
        let samples = std::mem::take(&mut self.samples);
        let (Some(play), Some(map)) = (prev.gameplay.as_ref(), self.map.clone()) else {
            return;
        };
        if !is_solo(prev) || play.failed || next_screen != Screen::Results {
            return;
        }
        let pp = play.pp.as_ref().map_or(0.0, |p| p.live);
        let previous = self.best.as_deref();
        let max_pp = previous.map_or(pp, |b| b.max_pp.max(pp));
        let beats_score = previous.is_none_or(|b| b.best.score < play.score);
        if !beats_score && previous.is_some_and(|b| max_pp <= b.max_pp) {
            return;
        }
        let ghost = match previous {
            Some(old) if !beats_score => PersonalBestGhost {
                max_pp,
                ..old.clone()
            },
            _ => {
                let mut samples = samples;
                let end = samples.last().map_or(0.0, |s| s[0] + 1.0);
                samples.push(sample(end, play));
                PersonalBestGhost {
                    best: PersonalBest {
                        score: play.score,
                        pp,
                        accuracy: play.accuracy,
                        max_combo: play.max_combo,
                        mods: prev.mods.clone(),
                        played_at: now_ms(),
                    },
                    samples,
                    max_pp,
                }
            }
        };
        // A record that cannot be written is still a record for this session.
        let _ = save(&self.dir, &map, &ghost);
        let ghost = Arc::new(ghost);
        self.hub.set_ghost(Some(Arc::clone(&ghost)));
        self.best = Some(ghost);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lazer_reader::model::{Beatmap, Pp, Time, TimeSource};
    use overlay_server::{ApiSettings, Hub};

    fn hub() -> Hub {
        Hub::new(ApiSettings {
            poll_interval_ms: 33,
            input_poll_interval_ms: 2,
            port: 24051,
        })
    }

    fn state(screen: Screen, play: Option<(i64, f64)>, failed: bool) -> GameState {
        GameState {
            connected: true,
            screen,
            screen_type: "osu.Game.Screens.Play.SoloPlayer".into(),
            beatmap: Some(Beatmap {
                sha256: "abc123".into(),
                ..Beatmap::default()
            }),
            time: Some(Time {
                current_ms: play.map_or(0.0, |p| p.1),
                running: true,
                source: TimeSource::Gameplay,
            }),
            gameplay: play.map(|(score, _)| Gameplay {
                score,
                failed,
                ..Gameplay::default()
            }),
            ..GameState::default()
        }
    }

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yar-rec-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn run(records: &mut Records, steps: &[(i64, f64)], end_failed: bool) {
        let mut prev: Option<GameState> = None;
        for &(score, t) in steps {
            let mut s = state(Screen::Playing, Some((score, t)), false);
            records.observe(prev.as_ref(), &mut s);
            prev = Some(s);
        }
        let last = steps.last().copied();
        let mut played = state(Screen::Playing, last, end_failed);
        records.observe(prev.as_ref(), &mut played);
        let mut results = state(Screen::Results, None, false);
        records.observe(Some(&played), &mut results);
    }

    #[test]
    fn observe_should_keep_a_completed_play_as_the_record() {
        let dir = temp("keep");
        let mut records = Records::new(dir.clone(), hub());
        run(
            &mut records,
            &[(0, 0.0), (500, 1000.0), (900, 2000.0)],
            false,
        );
        let best = records.best.as_ref().unwrap();
        assert_eq!(best.best.score, 900);
        assert_eq!(best.samples.len(), 4);
        assert_eq!(load(&dir, "abc123").unwrap().best.score, 900);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn observe_should_not_replace_a_better_record() {
        let dir = temp("better");
        let mut records = Records::new(dir.clone(), hub());
        run(&mut records, &[(0, 0.0), (900, 2000.0)], false);
        run(&mut records, &[(0, 0.0), (400, 2000.0)], false);
        assert_eq!(records.best.as_ref().unwrap().best.score, 900);
        let _ = std::fs::remove_dir_all(dir);
    }

    fn finish_play(records: &mut Records, score: i64, pp: f64) {
        let mut playing = state(Screen::Playing, Some((score, 2000.0)), false);
        if let Some(play) = playing.gameplay.as_mut() {
            play.pp = Some(Pp {
                live: pp,
                ..Pp::default()
            });
        }
        records.observe(None, &mut playing);
        let mut results = state(Screen::Results, None, false);
        records.observe(Some(&playing), &mut results);
    }

    #[test]
    fn observe_should_keep_the_highest_pp_even_when_the_score_is_lower() {
        let dir = temp("maxpp");
        let mut records = Records::new(dir.clone(), hub());
        finish_play(&mut records, 900, 120.0);
        finish_play(&mut records, 400, 150.0);
        let best = records.best.as_ref().unwrap();
        assert_eq!(best.best.score, 900);
        assert_eq!(best.max_pp, 150.0);
        assert_eq!(load(&dir, "abc123").unwrap().max_pp, 150.0);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn observe_should_ignore_a_failed_play() {
        let dir = temp("failed");
        let mut records = Records::new(dir.clone(), hub());
        run(&mut records, &[(0, 0.0), (900, 2000.0)], true);
        assert!(records.best.is_none());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn observe_should_restart_the_samples_on_a_retry() {
        let dir = temp("retry");
        let mut records = Records::new(dir.clone(), hub());
        let mut prev = None;
        for (score, t) in [(0, 0.0), (500, 5000.0), (0, 0.0), (100, 1000.0)] {
            let mut s = state(Screen::Playing, Some((score, t)), false);
            records.observe(prev.as_ref(), &mut s);
            prev = Some(s);
        }
        assert_eq!(records.samples.len(), 2);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn observe_should_expose_the_record_in_the_state() {
        let dir = temp("expose");
        let mut records = Records::new(dir.clone(), hub());
        run(&mut records, &[(0, 0.0), (900, 2000.0)], false);
        let mut menu = state(Screen::SongSelect, None, false);
        records.observe(None, &mut menu);
        assert_eq!(menu.personal_best.unwrap().score, 900);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn file_for_should_refuse_a_path_like_hash() {
        assert!(file_for(Path::new("x"), "../evil").is_none());
        assert!(file_for(Path::new("x"), "").is_none());
        assert!(file_for(Path::new("x"), "AB12").is_some());
    }
}
