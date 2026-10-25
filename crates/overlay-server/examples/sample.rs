//! A local API fed with a scripted, fake game: develop overlays and clients without osu!lazer.
//!
//! ```text
//! cargo run -p overlay-server --example sample [port] [idle]
//! ```
//!
//! With `idle`, the game is "not running": the status is `waiting` and the state is empty.
//!
//! It serves the real router on `127.0.0.1:<port>` (24051 by default, so stop the application
//! first) and plays a loop: song select, a play with hits and a pause, the results screen, the
//! menu. The held keys move too, and a beatmap background / audio file and a community widget
//! are served from a temporary folder, so every route of the API answers.

use std::path::{Path, PathBuf};
use std::time::Duration;

use lazer_reader::input::InputState;
use lazer_reader::model::{
    Assets, Beatmap, Difficulty, DifficultyGraph, GameState, Gameplay, Hits, Paths, PersonalBest,
    PersonalBestGhost, PlayingState, Pp, ReaderStatus, Screen, Spectator, Time, TimeSource, User,
    UserStatistics,
};
use overlay_server::{ApiSettings, Hub};

const BACKGROUND_SHA: &str = "4c2a4cef18bc3b44a53cdb177b297ffddfff974161747d3eeb9b8343d3199019";
const AUDIO_SHA: &str = "64702a5cf236ade456609f44b8ca5f00916f8ac4a49396b773086503d150f432";
const BEATMAP_SHA: &str = "25d51b11477f583d2df7f9c61414dbe917e3ddd2889900e1a06322e3a1f3d694";

/// Where lazer keeps a file of a given hash on Windows (the files have no extension).
fn file_path(sha: &str) -> String {
    format!(
        r"C:\Users\you\AppData\Roaming\osu\files\{}\{}\{sha}",
        &sha[..1],
        &sha[..2]
    )
}

fn beatmap() -> Beatmap {
    Beatmap {
        title: "hyperpop luv <3".into(),
        title_unicode: "hyperpop luv <3".into(),
        artist: "whyalive x Denya8".into(),
        artist_unicode: "whyalive x Denya8".into(),
        version: "collab expert".into(),
        creator: "Daycore".into(),
        source: String::new(),
        tags: "hyperpop electronic".into(),
        online_id: 4_859_840,
        set_online_id: 2_279_931,
        status: "ranked".into(),
        ruleset: "osu".into(),
        md5: "f29e9bcdd8e4ab1b4ff1e7b19fdc338a".into(),
        sha256: BEATMAP_SHA.into(),
        length_ms: 69_166.0,
        bpm: 180.0,
        star_rating: 5.28,
        cs: 4.4,
        ar: 9.2,
        od: 8.5,
        hp: 5.0,
        slider_multiplier: 1.9,
        slider_tick_rate: 1.0,
        object_count: 327,
        preview_time_ms: 19_649,
        audio_file: "audio.mp3".into(),
        background_file: "1.jpg".into(),
        paths: Paths {
            beatmap: Some(file_path(BEATMAP_SHA)),
            background: Some(file_path(BACKGROUND_SHA)),
            audio: Some(file_path(AUDIO_SHA)),
        },
        assets: Assets {
            background: true,
            audio: true,
        },
        background_sha256: Some(BACKGROUND_SHA.into()),
        audio_sha256: Some(AUDIO_SHA.into()),
    }
}

fn user() -> User {
    User {
        id: 1,
        username: "iSweat".into(),
        country_code: "FR".into(),
        avatar_url: "https://a.ppy.sh/1".into(),
        api_state: "online".into(),
        statistics: Some(UserStatistics {
            global_rank: Some(130_103),
            country_rank: Some(4_120),
            pp: Some(4_696.0),
            accuracy: 98.12,
            play_count: 24_511,
            total_hits: 4_200_000,
            max_combo: 2_210,
            ranked_score: 9_000_000_000,
            total_score: 21_000_000_000,
        }),
    }
}

/// A made-up strain curve: calm intro, a stream section, a break, a harder finish.
fn spectators() -> Vec<Spectator> {
    [(1001, "Alice"), (1002, "Bob"), (1003, "Charlie")]
        .into_iter()
        .map(|(id, name)| Spectator {
            id,
            username: name.to_string(),
            avatar_url: Some(format!("https://a.ppy.sh/{id}")),
        })
        .collect()
}

fn graph() -> DifficultyGraph {
    let buckets: Vec<f32> = (0..120)
        .map(|i| {
            let t = f64::from(i) / 120.0;
            let v = match t {
                t if t < 0.15 => 0.15 + t,
                t if t < 0.45 => 0.55 + 0.25 * (t * 40.0).sin().abs(),
                t if t < 0.55 => 0.12,
                t => 0.6 + 0.4 * ((t - 0.55) / 0.45) * (0.7 + 0.3 * (t * 60.0).sin().abs()),
            };
            (v.clamp(0.0, 1.0) * 1000.0).round() as f32 / 1000.0
        })
        .collect();
    let peak = buckets
        .iter()
        .enumerate()
        .fold((0, 0.0_f32), |b, (i, &v)| if v > b.1 { (i, v) } else { b })
        .0;
    DifficultyGraph {
        duration_ms: 180_000.0,
        overall: 7.4,
        peak_ms: (peak as f64 + 0.5) * 1_500.0,
        buckets,
    }
}

fn base(screen: Screen, screen_type: &str) -> GameState {
    GameState {
        connected: true,
        version: Some("2026.1005.0-lazer+9a10d935".into()),
        screen,
        screen_type: screen_type.into(),
        playing: PlayingState::NotPlaying,
        ruleset: Some("osu".into()),
        mods: vec!["HD".into(), "DT".into()],
        clock_rate: 1.5,
        difficulty_adjust: None,
        beatmap: Some(beatmap()),
        difficulty: Some(Difficulty {
            stars: 7.4,
            max_combo: 348,
            pp95: 250.0,
            pp98: 290.0,
            pp99: 310.0,
            pp100: 340.0,
            first_object_ms: 3_200.0,
            last_object_ms: 176_400.0,
        }),
        difficulty_graph: Some(graph()),
        time: Some(Time {
            current_ms: 19_649.0,
            running: true,
            source: TimeSource::Global,
        }),
        user: Some(user()),
        spectators: spectators(),
        spectator_count: 3,
        gameplay: None,
        personal_best: Some(record().best),
    }
}

/// A made-up personal best: a steady 66 000 points over the 36 seconds of the scripted play.
fn record() -> PersonalBestGhost {
    PersonalBestGhost {
        best: PersonalBest {
            score: 66_000,
            pp: 148.2,
            accuracy: 0.9812,
            max_combo: 301,
            mods: vec!["HD".into(), "DT".into()],
            played_at: 1_760_000_000_000,
        },
        samples: (0..=9)
            .map(|i| {
                let k = f64::from(i);
                [
                    k * 4_000.0,
                    66_000.0 * k / 9.0,
                    100.0 + 48.2 * k / 9.0,
                    0.985 - 0.004 * k / 9.0,
                ]
            })
            .collect(),
        max_pp: 152.7,
    }
}

fn playing(step: i32, paused: bool) -> GameState {
    // The combo breaks on the step of the first miss.
    let combo = if step >= 7 { (step - 6) * 7 } else { step * 7 };
    let great = step * 7;
    let mut state = base(Screen::Playing, "osu.Game.Screens.Play.SoloPlayer");
    state.playing = PlayingState::Playing;
    state.time = Some(Time {
        current_ms: f64::from(step) * 4_000.0,
        running: !paused,
        source: TimeSource::Gameplay,
    });
    state.gameplay = Some(Gameplay {
        score: i64::from(great) * 1_100,
        score_without_mods: i64::from(great) * 800,
        accuracy: 0.9871,
        combo,
        max_combo: combo.max(21),
        beatmap_max_combo: 348,
        rank: "S".into(),
        hits: Hits {
            great,
            ok: step,
            meh: 0,
            miss: i32::from(step > 6),
        },
        results: [
            ("Great".to_owned(), great),
            ("Ok".to_owned(), step),
            ("Miss".to_owned(), i32::from(step > 6)),
            ("LargeTickHit".to_owned(), 15),
            ("SliderTailHit".to_owned(), 45),
        ]
        .into_iter()
        .collect(),
        health: 0.94,
        paused,
        failed: false,
        pp: Some(Pp {
            live: 102.7 + f64::from(step),
            fc: 156.7,
            ss: 255.4,
        }),
        unstable_rate: Some(144.6),
        hit_errors: vec![
            -3.78,
            -3.32,
            -1.24,
            4.5,
            8.1,
            f32::from(i16::try_from(step).unwrap_or(0)) * 1.5 - 6.0,
        ],
    });
    state
}

/// One step of the story, a second long.
fn frame(n: i32) -> GameState {
    match n % 16 {
        0..=2 => base(Screen::SongSelect, "osu.Game.Screens.Select.SoloSongSelect"),
        3..=11 => playing(n % 16 - 2, n % 16 == 8),
        12..=13 => base(
            Screen::Results,
            "osu.Game.Screens.Ranking.SoloResultsScreen",
        ),
        _ => base(Screen::Menu, "osu.Game.Screens.Menu.MainMenu"),
    }
}

/// Fake held keys: Z and X alternating while a play runs, a click now and then.
fn held(n: i32, tick: i32) -> InputState {
    let playing = (3..=11).contains(&(n % 16));
    let keys = match (playing, tick % 4) {
        (true, 0 | 1) => vec![108], // Z
        (true, 2) => vec![],
        (true, _) => vec![106], // X is 83 + 23 = 106 in osuTK's order
        _ => vec![],
    };
    let mouse = if playing && tick % 8 < 2 {
        vec![0]
    } else {
        vec![]
    };
    InputState::from_codes(keys, mouse)
}

fn write(root: &Path, sha: &str, bytes: &[u8]) {
    let dir = root.join("files").join(&sha[..1]).join(&sha[..2]);
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(dir.join(sha), bytes);
}

/// A valid 1x1 PNG, imported as the sample picture of the `images` route.
const SAMPLE_PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0xDA, 0x63, 0xF8, 0xCF, 0xC0, 0xF0,
    0x1F, 0x00, 0x05, 0x00, 0x01, 0xFF, 0x89, 0x99, 0x3D, 0x1D, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

/// A storage with a one-pixel picture and a few bytes of "audio", and one community widget.
fn fake_storage() -> (PathBuf, PathBuf) {
    let root = std::env::temp_dir().join("yar-sample");
    let _ = std::fs::remove_dir_all(&root);
    // The smallest valid JPEG-like payload is enough: the API serves the bytes untouched.
    write(&root, BACKGROUND_SHA, &[0xFF, 0xD8, 0xFF, 0xD9]);
    write(&root, AUDIO_SHA, b"ID3 not really audio");
    let widgets = root.join("widgets");
    let widget = widgets.join("hello-score");
    let _ = std::fs::create_dir_all(&widget);
    let _ = std::fs::write(
        widget.join("manifest.json"),
        r##"{ "name": "Hello score", "version": "1.0.0", "author": "Toi", "description": "Affiche le score en direct.",
  "entry": "index.html", "defaultSize": { "w": 420, "h": 140 },
  "options": [ { "key": "color", "type": "color", "label": "Couleur", "default": "#f472b6" } ] }"##,
    );
    let _ = std::fs::write(
        widget.join("index.html"),
        "<!doctype html><title>hello</title>",
    );
    (root, widgets)
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let port: u16 = std::env::args()
        .nth(1)
        .and_then(|p| p.parse().ok())
        .unwrap_or(24051);
    let idle = std::env::args().any(|a| a == "idle");
    let hub = Hub::new(ApiSettings {
        poll_interval_ms: 33,
        input_poll_interval_ms: 2,
        port,
    });
    hub.set_ghost(Some(std::sync::Arc::new(record())));
    let (storage, widgets) = fake_storage();
    // One imported picture (a 1x1 PNG), served at /api/v1/images/{id}.
    let images = storage.join("images");
    let picture = overlay_server::images::import(&images, SAMPLE_PNG)
        .map_err(|e| std::io::Error::other(e.to_string()))?;
    println!("sample picture: /api/v1/images/{}", picture.id);
    let server = overlay_server::start_with_images(
        hub.clone(),
        port,
        Some(storage),
        Some(widgets),
        Some(images),
    )
    .await?;
    println!(
        "sample API on http://{}/api/v1 (Ctrl+C to stop)",
        server.addr
    );

    if idle {
        hub.publish_state(GameState::default());
        hub.publish_status(ReaderStatus::Waiting);
        std::future::pending::<()>().await;
    }
    hub.publish_status(ReaderStatus::Connected {
        version: "2026.1005.0-lazer+9a10d935".into(),
        stream: "lazer".into(),
        profile: "embedded default".into(),
        connect_ms: 5_200,
        gc_mode: Some(lazer_reader::model::GcMode::Interactive),
    });
    let mut n = 0;
    loop {
        // Once per loop the connection to the game "blinks", to show the status messages.
        match n % 16 {
            14 => hub.publish_status(ReaderStatus::Connecting),
            15 => hub.publish_status(ReaderStatus::Connected {
                version: "2026.1005.0-lazer+9a10d935".into(),
                stream: "lazer".into(),
                profile: "embedded default".into(),
                connect_ms: 5_200,
                gc_mode: Some(lazer_reader::model::GcMode::Interactive),
            }),
            _ => {}
        }
        hub.publish_state(frame(n));
        // Four input changes per second of story, as a fast player would make.
        for tick in 0..4 {
            let _ = hub.publish_inputs(&held(n, tick));
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
        n += 1;
    }
}
