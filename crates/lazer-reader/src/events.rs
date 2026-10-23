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
        }
        (None, None) => {}
    }
    out
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
