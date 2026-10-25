//! "Now playing" as plain files: a text file and the beatmap's cover, rewritten when the map changes.
//!
//! OBS text sources, chat bots (Twitch commands) and stream tools can all read a file, which spares
//! them a browser source. Nothing here touches the game: it only reads the state the reader published.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::Duration;

use lazer_reader::model::GameState;
use overlay_server::Hub;

/// File names inside the output folder.
pub const TEXT_FILE: &str = "nowplaying.txt";
pub const COVER_STEM: &str = "cover";
pub const DEFAULT_TEMPLATE: &str = "{artist} - {title} [{version}]";
pub const MAX_TEMPLATE_CHARS: usize = 500;
const TICK: Duration = Duration::from_millis(500);

/// What the thread reads; replaced whenever the settings change.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct NowPlayingConfig {
    pub enabled: bool,
    pub dir: PathBuf,
    pub template: String,
}

pub type SharedConfig = Arc<Mutex<NowPlayingConfig>>;

/// Replaces `{name}` placeholders. An unknown placeholder is left as typed, so a typo is visible.
pub fn render(template: &str, game: &GameState) -> String {
    let Some(map) = game.beatmap.as_ref() else {
        return String::new();
    };
    let play = game.gameplay.as_ref();
    let mods = game.mods.join("");
    let value = |name: &str| -> Option<String> {
        Some(match name {
            "artist" => map.artist.clone(),
            "title" => map.title.clone(),
            "artistUnicode" => map.artist_unicode.clone(),
            "titleUnicode" => map.title_unicode.clone(),
            "version" => map.version.clone(),
            "creator" => map.creator.clone(),
            "mods" => mods.clone(),
            "stars" => format!(
                "{:.2}",
                game.difficulty
                    .as_ref()
                    .map_or(map.star_rating, |d| d.stars)
            ),
            "bpm" => format!("{:.0}", map.bpm),
            "link" if map.online_id > 0 => format!("https://osu.ppy.sh/b/{}", map.online_id),
            "link" => String::new(),
            "score" => play.map_or(0, |g| g.score).to_string(),
            "combo" => play.map_or(0, |g| g.combo).to_string(),
            "accuracy" => format!("{:.2}", play.map_or(0.0, |g| g.accuracy)),
            "pp" => format!(
                "{:.0}",
                play.and_then(|g| g.pp.as_ref()).map_or(0.0, |p| p.live)
            ),
            _ => return None,
        })
    };
    let mut out = String::with_capacity(template.len() + 32);
    let mut rest = template;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        match after.find('}') {
            Some(close) => match value(&after[..close]) {
                Some(text) => {
                    out.push_str(&text);
                    rest = &after[close + 1..];
                }
                None => {
                    out.push('{');
                    rest = after;
                }
            },
            None => {
                out.push_str(&rest[open..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    // One line per file: a newline in a title would split an OBS text source.
    out.replace(['\r', '\n'], " ")
}

/// The extension to give the cover, from the name the game stores for it.
fn cover_extension(background_file: &str) -> &'static str {
    match Path::new(background_file)
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => "png",
        Some("webp") => "webp",
        _ => "jpg",
    }
}

fn clear_covers(dir: &Path) {
    for ext in ["jpg", "png", "webp"] {
        let _ = std::fs::remove_file(dir.join(format!("{COVER_STEM}.{ext}")));
    }
}

/// Writes only what changed since the previous call.
#[derive(Default)]
struct Writer {
    text: Option<String>,
    cover_of: Option<Option<String>>,
    dir: PathBuf,
}

impl Writer {
    fn update(&mut self, config: &NowPlayingConfig, game: &GameState) -> std::io::Result<()> {
        if self.dir != config.dir {
            *self = Self {
                dir: config.dir.clone(),
                ..Self::default()
            };
        }
        std::fs::create_dir_all(&config.dir)?;
        let text = render(&config.template, game);
        if self.text.as_deref() != Some(text.as_str()) {
            std::fs::write(config.dir.join(TEXT_FILE), &text)?;
            self.text = Some(text);
        }
        let cover = game.beatmap.as_ref().and_then(|b| {
            b.paths
                .background
                .clone()
                .map(|p| (p, b.background_file.clone()))
        });
        let key = cover.as_ref().map(|(path, _)| path.clone());
        if self.cover_of.as_ref() != Some(&key) {
            clear_covers(&config.dir);
            if let Some((path, name)) = cover {
                let target = config
                    .dir
                    .join(format!("{COVER_STEM}.{}", cover_extension(&name)));
                // A missing source file just means no cover for this map.
                let _ = std::fs::copy(path, target);
            }
            self.cover_of = Some(key);
        }
        Ok(())
    }
}

pub fn spawn(hub: Hub, config: SharedConfig) -> std::io::Result<()> {
    thread::Builder::new()
        .name("now-playing".into())
        .spawn(move || {
            let mut writer = Writer::default();
            loop {
                thread::sleep(TICK);
                let current = config
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .clone();
                if current.enabled {
                    let _ = writer.update(&current, &hub.game());
                } else {
                    // Switched off: forget what was written so switching on again rewrites it.
                    writer = Writer::default();
                }
            }
        })
        .map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lazer_reader::model::Beatmap;

    fn playing(title: &str) -> GameState {
        GameState {
            beatmap: Some(Beatmap {
                artist: "Camellia".into(),
                title: title.into(),
                version: "Insane".into(),
                online_id: 42,
                ..Beatmap::default()
            }),
            mods: vec!["HD".into(), "DT".into()],
            ..GameState::default()
        }
    }

    #[test]
    fn render_should_fill_placeholders() {
        let text = render(
            "{artist} - {title} [{version}] +{mods} {link}",
            &playing("Exit"),
        );
        assert_eq!(
            text,
            "Camellia - Exit [Insane] +HDDT https://osu.ppy.sh/b/42"
        );
    }

    #[test]
    fn render_should_keep_an_unknown_placeholder_as_typed() {
        assert_eq!(render("{nope} {title}", &playing("A")), "{nope} A");
        assert_eq!(render("{title", &playing("A")), "{title");
    }

    #[test]
    fn render_should_be_empty_without_a_beatmap() {
        assert_eq!(render(DEFAULT_TEMPLATE, &GameState::default()), "");
    }

    #[test]
    fn render_should_keep_the_text_on_one_line() {
        assert_eq!(render("{title}", &playing("a\nb")), "a b");
    }

    #[test]
    fn writer_should_write_the_text_once_per_change() {
        let dir = std::env::temp_dir().join(format!("yar-np-{}", std::process::id()));
        let config = NowPlayingConfig {
            enabled: true,
            dir: dir.clone(),
            template: DEFAULT_TEMPLATE.into(),
        };
        let mut writer = Writer::default();
        writer.update(&config, &playing("Exit")).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join(TEXT_FILE)).unwrap(),
            "Camellia - Exit [Insane]"
        );
        std::fs::write(dir.join(TEXT_FILE), "edited").unwrap();
        writer.update(&config, &playing("Exit")).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join(TEXT_FILE)).unwrap(),
            "edited"
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn cover_extension_should_follow_the_stored_name() {
        assert_eq!(cover_extension("bg.PNG"), "png");
        assert_eq!(cover_extension("bg.jpeg"), "jpg");
        assert_eq!(cover_extension(""), "jpg");
    }
}
