//! Discrete events derived by comparing two consecutive [`GameState`]s.
//!
//! Overlays can poll `state` for continuous values, but transitions (a play started, a map
//! changed...) are easier to react to as events.

use serde::Serialize;

use crate::model::{Beatmap, GameState, Gameplay, Screen};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "name",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Event {
    /// osu!lazer was attached (`connected: true`) or went away.
    ConnectionChanged {
        connected: bool,
    },
    ScreenChanged {
        from: Screen,
        to: Screen,
        screen_type: String,
    },
    /// A different beatmap got selected. `beatmap` is `None` when the selection was cleared.
    BeatmapChanged {
        beatmap: Option<Box<Beatmap>>,
    },
    ModsChanged {
        mods: Vec<String>,
    },
    PlayStarted {
        beatmap: Option<Box<Beatmap>>,
        mods: Vec<String>,
    },
    /// The play screen was left. `reason` is `failed`, `completed` or `quit`.
    PlayEnded {
        reason: PlayEndReason,
        beatmap: Option<Box<Beatmap>>,
        mods: Vec<String>,
        /// The last gameplay values seen before the screen closed.
        result: Box<Gameplay>,
    },
    Paused,
    Resumed,
    Failed,
    /// Notes were hit since the last state. `judgement` is `great`, `ok` or `meh`; `count` is how many
    /// (several can land between two samples). `errorsMs` are the timing errors of the newest hits
    /// (negative = early), empty when the game gave none (sliders, spinners).
    Hit {
        judgement: Judgement,
        count: u32,
        errors_ms: Vec<f32>,
        combo: i32,
    },
    /// Notes were missed since the last state.
    Miss {
        count: u32,
        combo: i32,
    },
    /// The combo fell: `lost` is the combo that was just broken (a miss, a slider break...).
    ComboBreak {
        lost: i32,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Judgement {
    Great,
    Ok,
    Meh,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PlayEndReason {
    Failed,
    Completed,
    Quit,
}

/// Events that happened between `prev` and `next`, in a stable order.
pub fn diff(prev: &GameState, next: &GameState) -> Vec<Event> {
    let mut out = Vec::new();

    if prev.connected != next.connected {
        out.push(Event::ConnectionChanged {
            connected: next.connected,
        });
    }
    if prev.screen != next.screen || prev.screen_type != next.screen_type {
        out.push(Event::ScreenChanged {
            from: prev.screen,
            to: next.screen,
            screen_type: next.screen_type.clone(),
        });
    }
    if prev.beatmap.as_ref().map(|b| &b.sha256) != next.beatmap.as_ref().map(|b| &b.sha256) {
        out.push(Event::BeatmapChanged {
            beatmap: next.beatmap.clone().map(Box::new),
        });
    }
    if prev.mods != next.mods {
        out.push(Event::ModsChanged {
            mods: next.mods.clone(),
        });
    }

    match (&prev.gameplay, &next.gameplay) {
        (None, Some(_)) => out.push(Event::PlayStarted {
            beatmap: next.beatmap.clone().map(Box::new),
            mods: next.mods.clone(),
        }),
        (Some(last), None) => {
            let reason = if last.failed {
                PlayEndReason::Failed
            } else if next.screen == Screen::Results {
                PlayEndReason::Completed
            } else {
                PlayEndReason::Quit
            };
            out.push(Event::PlayEnded {
                reason,
                beatmap: prev.beatmap.clone().map(Box::new),
                mods: prev.mods.clone(),
                result: Box::new(last.clone()),
            });
        }
        (Some(a), Some(b)) => {
            if !a.paused && b.paused {
                out.push(Event::Paused);
            }
            if a.paused && !b.paused {
                out.push(Event::Resumed);
            }
            if !a.failed && b.failed {
                out.push(Event::Failed);
            }
            hit_events(a, b, &mut out);
        }
        (None, None) => {}
    }
    out
}

/// Per-note events: the judgement counters only go up during a play, so a rise is new notes.
fn hit_events(a: &Gameplay, b: &Gameplay, out: &mut Vec<Event>) {
    let rise = |from: i32, to: i32| u32::try_from(to.saturating_sub(from)).unwrap_or(0);
    let hits = [
        (Judgement::Great, rise(a.hits.great, b.hits.great)),
        (Judgement::Ok, rise(a.hits.ok, b.hits.ok)),
        (Judgement::Meh, rise(a.hits.meh, b.hits.meh)),
    ];
    let new_hits: u32 = hits.iter().map(|(_, n)| n).sum();
    // The ring holds the newest errors last; only trust it when it moved.
    let errors: Vec<f32> = if a.hit_errors == b.hit_errors {
        Vec::new()
    } else {
        let keep = (new_hits as usize).min(b.hit_errors.len());
        b.hit_errors[b.hit_errors.len() - keep..].to_vec()
    };
    for (judgement, count) in hits {
        if count > 0 {
            out.push(Event::Hit {
                judgement,
                count,
                errors_ms: if new_hits == count {
                    errors.clone()
                } else {
                    Vec::new()
                },
                combo: b.combo,
            });
        }
    }
    let misses = rise(a.hits.miss, b.hits.miss);
    if misses > 0 {
        out.push(Event::Miss {
            count: misses,
            combo: b.combo,
        });
    }
    if b.combo < a.combo {
        out.push(Event::ComboBreak { lost: a.combo });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn playing() -> GameState {
        GameState {
            connected: true,
            screen: Screen::Playing,
            gameplay: Some(Gameplay::default()),
            ..GameState::default()
        }
    }

    #[test]
    fn diff_should_report_play_start_when_gameplay_appears() {
        let menu = GameState {
            connected: true,
            screen: Screen::SongSelect,
            ..GameState::default()
        };
        let events = diff(&menu, &playing());
        assert!(
            events
                .iter()
                .any(|e| matches!(e, Event::PlayStarted { .. }))
        );
        assert!(events.iter().any(|e| matches!(
            e,
            Event::ScreenChanged {
                to: Screen::Playing,
                ..
            }
        )));
    }

    #[test]
    fn diff_should_report_completed_when_results_follow_a_play() {
        let results = GameState {
            connected: true,
            screen: Screen::Results,
            ..GameState::default()
        };
        let events = diff(&playing(), &results);
        assert!(events.iter().any(|e| matches!(
            e,
            Event::PlayEnded {
                reason: PlayEndReason::Completed,
                ..
            }
        )));
    }

    #[test]
    fn diff_should_report_quit_when_returning_to_song_select() {
        let select = GameState {
            connected: true,
            screen: Screen::SongSelect,
            ..GameState::default()
        };
        let events = diff(&playing(), &select);
        assert!(events.iter().any(|e| matches!(
            e,
            Event::PlayEnded {
                reason: PlayEndReason::Quit,
                ..
            }
        )));
    }

    #[test]
    fn diff_should_report_failed_end_when_the_play_had_failed() {
        let mut failed = playing();
        failed.gameplay.as_mut().unwrap().failed = true;
        let select = GameState {
            connected: true,
            screen: Screen::SongSelect,
            ..GameState::default()
        };
        let events = diff(&failed, &select);
        assert!(events.iter().any(|e| matches!(
            e,
            Event::PlayEnded {
                reason: PlayEndReason::Failed,
                ..
            }
        )));
    }

    #[test]
    fn diff_should_report_pause_and_resume() {
        let mut paused = playing();
        paused.gameplay.as_mut().unwrap().paused = true;
        assert_eq!(diff(&playing(), &paused), vec![Event::Paused]);
        assert_eq!(diff(&paused, &playing()), vec![Event::Resumed]);
    }

    fn with_hits(great: i32, miss: i32, combo: i32) -> GameState {
        let mut state = playing();
        let g = state.gameplay.as_mut().unwrap();
        g.hits.great = great;
        g.hits.miss = miss;
        g.combo = combo;
        state
    }

    #[test]
    fn diff_should_report_hits_with_their_count() {
        let events = diff(&with_hits(1, 0, 1), &with_hits(3, 0, 3));
        assert_eq!(
            events,
            vec![Event::Hit {
                judgement: Judgement::Great,
                count: 2,
                errors_ms: vec![],
                combo: 3
            }]
        );
    }

    #[test]
    fn diff_should_report_a_miss_and_the_broken_combo() {
        let events = diff(&with_hits(5, 0, 5), &with_hits(5, 1, 0));
        assert!(events.contains(&Event::Miss { count: 1, combo: 0 }));
        assert!(events.contains(&Event::ComboBreak { lost: 5 }));
    }

    #[test]
    fn diff_should_report_a_combo_break_without_a_miss() {
        let events = diff(&with_hits(5, 0, 5), &with_hits(5, 0, 0));
        assert_eq!(events, vec![Event::ComboBreak { lost: 5 }]);
    }

    #[test]
    fn diff_should_attach_the_newest_hit_error() {
        let mut next = with_hits(2, 0, 2);
        next.gameplay.as_mut().unwrap().hit_errors = vec![3.0, -7.5];
        let mut prev = with_hits(1, 0, 1);
        prev.gameplay.as_mut().unwrap().hit_errors = vec![3.0];
        let events = diff(&prev, &next);
        assert!(matches!(&events[0], Event::Hit { errors_ms, .. } if errors_ms == &[-7.5]));
    }

    #[test]
    fn diff_should_be_empty_when_nothing_changed() {
        assert!(diff(&playing(), &playing()).is_empty());
    }

    /// The shapes documented in `docs/WEBSOCKET.md`: a change here is a change of the API.
    #[test]
    fn events_should_serialize_as_documented() {
        use serde_json::json;

        let beatmap = || Some(Box::new(Beatmap::default()));
        let beatmap_json = serde_json::to_value(Beatmap::default()).unwrap();
        let cases = [
            (
                Event::ConnectionChanged { connected: true },
                json!({ "name": "connectionChanged", "connected": true }),
            ),
            (
                Event::ScreenChanged {
                    from: Screen::SongSelect,
                    to: Screen::Playing,
                    screen_type: "osu.Game.Screens.Play.SoloPlayer".into(),
                },
                json!({ "name": "screenChanged", "from": "songSelect", "to": "playing", "screenType": "osu.Game.Screens.Play.SoloPlayer" }),
            ),
            (
                Event::BeatmapChanged { beatmap: beatmap() },
                json!({ "name": "beatmapChanged", "beatmap": beatmap_json }),
            ),
            (
                Event::BeatmapChanged { beatmap: None },
                json!({ "name": "beatmapChanged", "beatmap": null }),
            ),
            (
                Event::ModsChanged {
                    mods: vec!["HD".into(), "DT".into()],
                },
                json!({ "name": "modsChanged", "mods": ["HD", "DT"] }),
            ),
            (
                Event::PlayStarted {
                    beatmap: beatmap(),
                    mods: vec!["HD".into()],
                },
                json!({ "name": "playStarted", "beatmap": beatmap_json, "mods": ["HD"] }),
            ),
            (Event::Paused, json!({ "name": "paused" })),
            (Event::Resumed, json!({ "name": "resumed" })),
            (Event::Failed, json!({ "name": "failed" })),
        ];
        for (event, expected) in cases {
            assert_eq!(serde_json::to_value(&event).unwrap(), expected);
        }

        let ended = serde_json::to_value(Event::PlayEnded {
            reason: PlayEndReason::Completed,
            beatmap: beatmap(),
            mods: vec![],
            result: Box::new(Gameplay::default()),
        })
        .unwrap();
        let mut keys: Vec<_> = ended.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(keys, ["beatmap", "mods", "name", "reason", "result"]);
        assert_eq!(ended["reason"], "completed");
        assert_eq!(
            serde_json::to_value(PlayEndReason::Failed).unwrap(),
            "failed"
        );
        assert_eq!(serde_json::to_value(PlayEndReason::Quit).unwrap(), "quit");
    }
}
