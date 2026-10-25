//! REST endpoints. Every route is `GET`, read-only and returns JSON (except assets/docs).

use std::path::PathBuf;
use std::sync::Arc;

use axum::Json;
use axum::extract::{Request, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use lazer_reader::model::{
    Beatmap, Difficulty, DifficultyGraph, GameState, Gameplay, PersonalBestGhost, Pp, ReaderStatus,
    Screen, Time, User,
};
use lazer_reader::pp::store_path;
use serde::Serialize;
use tokio::sync::watch;
use tower::ServiceExt;
use tower_http::services::ServeFile;

use crate::API_VERSION;
use crate::hub::{ApiSettings, Hub, InputSnapshot, Snapshot};
use crate::images;

/// The pages of the API documentation, in reading order, as files of `docs/`.
const DOC_PAGES: [(&str, &str); 4] = [
    ("API.md", include_str!("../../../docs/API.md")),
    ("REST_API.md", include_str!("../../../docs/REST_API.md")),
    ("WEBSOCKET.md", include_str!("../../../docs/WEBSOCKET.md")),
    ("DATA_MODEL.md", include_str!("../../../docs/DATA_MODEL.md")),
];

/// Where the links of a page to another page of the API land once the four are one document.
const DOC_TITLES: [(&str, &str); 4] = [
    ("API.md", "guide-de-lapi-locale"),
    ("REST_API.md", "routes-rest"),
    ("WEBSOCKET.md", "websocket"),
    ("DATA_MODEL.md", "modèle-de-données"),
];

/// The API documentation served at `/api/v1/docs`: the four pages one after the other.
///
/// In the application each page is its own page and links to the others by file name
/// (`REST_API.md#get-state`); here they become links inside the one document (`#get-state`).
/// Links to pages outside the API documentation become plain text.
#[must_use]
pub fn docs_text() -> &'static str {
    static TEXT: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    TEXT.get_or_init(|| {
        let joined: Vec<&str> = DOC_PAGES.iter().map(|(_, text)| *text).collect();
        let one_document = joined.join("\n\n---\n\n").replace("\r\n", "\n");
        flatten_links(&strip_screenshots(&one_document))
    })
}

/// Removes the `> [!SCREENSHOT] id` blocks: the places of pictures that only make sense inside the application.
fn strip_screenshots(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_shot = false;
    for line in text.lines() {
        if line.starts_with("> [!SCREENSHOT]") {
            in_shot = true;
            continue;
        }
        if in_shot && line.starts_with("> ") {
            continue;
        }
        if in_shot {
            in_shot = false;
            // The blank line that followed the block would leave two in a row.
            if line.is_empty() {
                continue;
            }
        }
        out.push_str(line);
        out.push('\n');
    }
    out
}

/// Rewrites `[text](FILE.md#anchor)` links: to another page of the API, an in-document link;
/// to any other documentation page, the bare text.
fn flatten_links(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(open) = rest.find("](") {
        let (before, after) = rest.split_at(open);
        let target_start = 2;
        let Some(close) = after[target_start..].find(')') else {
            break;
        };
        let target = &after[target_start..target_start + close];
        let file = target.split('#').next().unwrap_or("");
        let is_doc_file = file.ends_with(".md")
            && file
                .chars()
                .all(|c| c.is_ascii_uppercase() || c == '_' || c == '.' || c.is_ascii_lowercase());
        if !is_doc_file {
            out.push_str(before);
            out.push_str(&after[..target_start + close + 1]);
            rest = &after[target_start + close + 1..];
            continue;
        }
        if let Some((_, title)) = DOC_TITLES.iter().find(|(name, _)| *name == file) {
            let anchor = target.split_once('#').map_or(*title, |(_, a)| a);
            out.push_str(before);
            out.push_str("](#");
            out.push_str(anchor);
            out.push(')');
        } else {
            // `[text](OTHER.md)` -> `text`: drop the whole link, keeping its label.
            match before.rfind('[') {
                Some(label_start) => {
                    out.push_str(&before[..label_start]);
                    out.push_str(&before[label_start + 1..]);
                }
                None => out.push_str(before),
            }
        }
        rest = &after[target_start + close + 1..];
    }
    out.push_str(rest);
    out
}

#[derive(Clone)]
pub struct AppState {
    pub hub: Hub,
    /// Root of lazer's data directory, used to serve beatmap assets.
    pub storage_root: Option<Arc<PathBuf>>,
    /// Folder of community widgets.
    pub widgets_dir: Option<Arc<PathBuf>>,
    /// Folder of the pictures imported for the `image` widget.
    pub images_dir: Option<Arc<PathBuf>>,
    /// Becomes `true` when the server is stopped: open WebSockets end instead of outliving it.
    pub shutdown: Arc<watch::Sender<bool>>,
}

/// JSON error body: `{"error": {"code": "...", "message": "..."}}`.
#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, "notFound", message)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = serde_json::json!({ "error": { "code": self.code, "message": self.message } });
        (self.status, Json(body)).into_response()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Index {
    name: &'static str,
    api_version: u32,
    app_version: &'static str,
    websocket: &'static str,
    inputs_websocket: &'static str,
    events_websocket: &'static str,
    documentation: &'static str,
    endpoints: &'static [Endpoint],
}

#[derive(Serialize)]
pub struct Endpoint {
    path: &'static str,
    description: &'static str,
}

const ENDPOINTS: &[Endpoint] = &[
    Endpoint {
        path: "/api/v1/health",
        description: "Liveness probe.",
    },
    Endpoint {
        path: "/api/v1/status",
        description: "Connection state of the reader.",
    },
    Endpoint {
        path: "/api/v1/settings",
        description: "Reader intervals and port (read-only).",
    },
    Endpoint {
        path: "/api/v1/snapshot",
        description: "Sequence number, status and full state in one call.",
    },
    Endpoint {
        path: "/api/v1/state",
        description: "The complete game state.",
    },
    Endpoint {
        path: "/api/v1/screen",
        description: "Current screen and playing state.",
    },
    Endpoint {
        path: "/api/v1/beatmap",
        description: "Selected beatmap metadata.",
    },
    Endpoint {
        path: "/api/v1/difficulty",
        description: "Star rating and PP table with the selected mods.",
    },
    Endpoint {
        path: "/api/v1/difficulty-graph",
        description: "Strain of the beatmap over its length with the selected mods (null while computing).",
    },
    Endpoint {
        path: "/api/v1/mods",
        description: "Selected mods and ruleset.",
    },
    Endpoint {
        path: "/api/v1/time",
        description: "Song clock position.",
    },
    Endpoint {
        path: "/api/v1/user",
        description: "Signed-in user and statistics.",
    },
    Endpoint {
        path: "/api/v1/gameplay",
        description: "Live play values (null outside a play).",
    },
    Endpoint {
        path: "/api/v1/pp",
        description: "Live / FC / SS performance points (null outside a play).",
    },
    Endpoint {
        path: "/api/v1/personal-best",
        description: "Best completed solo play of the current beatmap seen by the app, with per-second samples (null before the first).",
    },
    Endpoint {
        path: "/api/v1/hit-errors",
        description: "Unstable rate and recent hit timing errors.",
    },
    Endpoint {
        path: "/api/v1/inputs",
        description: "Keys and mouse buttons held down right now (real time).",
    },
    Endpoint {
        path: "/api/v1/inputs/ws",
        description: "WebSocket stream of key and mouse button changes (real time).",
    },
    Endpoint {
        path: "/api/v1/assets/background",
        description: "Current beatmap background image.",
    },
    Endpoint {
        path: "/api/v1/assets/audio",
        description: "Current beatmap audio file (supports Range).",
    },
    Endpoint {
        path: "/api/v1/images/{id}",
        description: "A picture imported for the image widget.",
    },
    Endpoint {
        path: "/api/v1/widgets",
        description: "Community widgets found in the widgets folder.",
    },
    Endpoint {
        path: "/api/v1/ws",
        description: "WebSocket stream of state, status and events.",
    },
    Endpoint {
        path: "/api/v1/events/ws",
        description: "WebSocket stream of events only (a note hit, a miss, a play started...), filterable with ?names=.",
    },
    Endpoint {
        path: "/api/v1/docs",
        description: "This documentation (Markdown).",
    },
];

pub async fn index() -> Json<Index> {
    Json(Index {
        name: "yet-another-reader",
        api_version: API_VERSION,
        app_version: env!("CARGO_PKG_VERSION"),
        websocket: "/api/v1/ws",
        inputs_websocket: "/api/v1/inputs/ws",
        events_websocket: "/api/v1/events/ws",
        documentation: "/api/v1/docs",
        endpoints: ENDPOINTS,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Health {
    ok: bool,
    uptime_ms: u64,
}

pub async fn health(State(s): State<AppState>) -> Json<Health> {
    Json(Health {
        ok: true,
        uptime_ms: s.hub.uptime_ms(),
    })
}

pub async fn status(State(s): State<AppState>) -> Json<ReaderStatus> {
    Json(s.hub.status())
}

pub async fn settings(State(s): State<AppState>) -> Json<ApiSettings> {
    Json(s.hub.settings())
}

pub async fn snapshot(State(s): State<AppState>) -> Json<Snapshot> {
    Json(s.hub.snapshot())
}

pub async fn state(State(s): State<AppState>) -> Json<GameState> {
    Json(s.hub.game())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenInfo {
    connected: bool,
    screen: Screen,
    screen_type: String,
    playing: lazer_reader::model::PlayingState,
}

pub async fn screen(State(s): State<AppState>) -> Json<ScreenInfo> {
    let g = s.hub.game();
    Json(ScreenInfo {
        connected: g.connected,
        screen: g.screen,
        screen_type: g.screen_type,
        playing: g.playing,
    })
}

pub async fn beatmap(State(s): State<AppState>) -> Json<Option<Beatmap>> {
    Json(s.hub.game().beatmap)
}

pub async fn difficulty_graph(State(s): State<AppState>) -> Json<Option<DifficultyGraph>> {
    Json(s.hub.game().difficulty_graph)
}

pub async fn difficulty(State(s): State<AppState>) -> Json<Option<Difficulty>> {
    Json(s.hub.game().difficulty)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModsInfo {
    ruleset: Option<String>,
    mods: Vec<String>,
}

pub async fn mods(State(s): State<AppState>) -> Json<ModsInfo> {
    let g = s.hub.game();
    Json(ModsInfo {
        ruleset: g.ruleset,
        mods: g.mods,
    })
}

pub async fn time(State(s): State<AppState>) -> Json<Option<Time>> {
    Json(s.hub.game().time)
}

pub async fn user(State(s): State<AppState>) -> Json<Option<User>> {
    Json(s.hub.game().user)
}

pub async fn gameplay(State(s): State<AppState>) -> Json<Option<Gameplay>> {
    Json(s.hub.game().gameplay)
}

/// The best completed solo play of the current beatmap the app has seen, with its per-second samples.
pub async fn personal_best(State(s): State<AppState>) -> Json<Option<PersonalBestGhost>> {
    Json(s.hub.ghost().map(|g| (*g).clone()))
}

pub async fn pp(State(s): State<AppState>) -> Json<Option<Pp>> {
    Json(s.hub.game().gameplay.and_then(|g| g.pp))
}

/// The keys and mouse buttons held down. Asking for them keeps them being read for a few seconds,
/// so polling this route works; a WebSocket (`/inputs/ws`) is the better way to follow them.
pub async fn inputs(State(s): State<AppState>) -> Json<InputSnapshot> {
    s.hub.touch_inputs();
    Json(s.hub.inputs())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HitErrors {
    unstable_rate: Option<f64>,
    errors: Vec<f32>,
}

pub async fn hit_errors(State(s): State<AppState>) -> Json<HitErrors> {
    let g = s.hub.game().gameplay;
    Json(HitErrors {
        unstable_rate: g.as_ref().and_then(|g| g.unstable_rate),
        errors: g.map(|g| g.hit_errors).unwrap_or_default(),
    })
}

pub async fn widgets(State(s): State<AppState>) -> Json<Vec<crate::widgets::WidgetManifest>> {
    Json(
        s.widgets_dir
            .map(|d| crate::widgets::scan(&d))
            .unwrap_or_default(),
    )
}

pub async fn docs() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/markdown; charset=utf-8")],
        docs_text(),
    )
}

fn mime_for(filename: &str) -> &'static str {
    match filename
        .rsplit('.')
        .next()
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("mp3") => "audio/mpeg",
        Some("ogg") => "audio/ogg",
        Some("wav") => "audio/wav",
        _ => "application/octet-stream",
    }
}

#[derive(Clone, Copy)]
pub enum Asset {
    Background,
    Audio,
}

/// Streams a file from lazer's content-addressed store (with HTTP Range support).
pub async fn asset(kind: Asset, s: AppState, req: Request) -> Result<Response, ApiError> {
    let map = s
        .hub
        .game()
        .beatmap
        .ok_or_else(|| ApiError::not_found("no beatmap is selected"))?;
    let (sha, filename) = match kind {
        Asset::Background => (map.background_sha256, map.background_file),
        Asset::Audio => (map.audio_sha256, map.audio_file),
    };
    let sha = sha.ok_or_else(|| ApiError::not_found("the beatmap has no such file"))?;
    let root = s
        .storage_root
        .ok_or_else(|| ApiError::not_found("lazer's data directory was not found"))?;
    let path = store_path(&root, &sha).ok_or_else(|| ApiError::not_found("invalid file hash"))?;
    if !path.is_file() {
        return Err(ApiError::not_found(
            "the file is missing from lazer's storage",
        ));
    }
    let mime = mime_for(&filename)
        .parse()
        .map_err(|_| ApiError::not_found("unknown media type"))?;
    ServeFile::new_with_mime(path, &mime)
        .oneshot(req)
        .await
        .map(IntoResponse::into_response)
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "io", e.to_string()))
}

/// Serves a picture imported for the `image` widget. The id is checked against the exact shape of the ids
/// the app makes, so nothing but a file of the images folder can be reached.
pub async fn image(
    State(s): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
    req: Request,
) -> Result<Response, ApiError> {
    let kind = images::kind_of_id(&id).ok_or_else(|| ApiError::not_found("no such picture"))?;
    let path = s
        .images_dir
        .as_deref()
        .and_then(|dir| images::path_for(dir, &id))
        .filter(|p| p.is_file())
        .ok_or_else(|| ApiError::not_found("no such picture"))?;
    let mime = kind
        .mime()
        .parse()
        .map_err(|_| ApiError::not_found("unknown media type"))?;
    let mut response = ServeFile::new_with_mime(path, &mime)
        .oneshot(req)
        .await
        .map(IntoResponse::into_response)
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "io", e.to_string()))?;
    let headers = response.headers_mut();
    // The id is a hash of the content: the answer never changes.
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=31536000, immutable"),
    );
    // An SVG opened on its own gets no script, no network and no origin of its own.
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("sandbox; default-src 'none'; style-src 'unsafe-inline'"),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mime_for_should_follow_the_extension() {
        assert_eq!(mime_for("bg.JPG"), "image/jpeg");
        assert_eq!(mime_for("audio.mp3"), "audio/mpeg");
        assert_eq!(mime_for("noext"), "application/octet-stream");
    }

    #[tokio::test]
    async fn inputs_route_should_report_the_held_keys_and_keep_them_being_read() {
        use axum::body::{Body, to_bytes};
        use lazer_reader::input::InputState;
        use tower::ServiceExt as _;

        let hub = Hub::new(ApiSettings {
            poll_interval_ms: 33,
            input_poll_interval_ms: 2,
            port: 24051,
        });
        assert!(hub.publish_inputs(&InputState::from_codes(vec![108, 83], vec![0])));
        assert!(!hub.inputs_wanted());

        let app = crate::router(hub.clone(), None, None);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/inputs")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["keys"], serde_json::json!(["A", "Z"]));
        assert_eq!(json["mouse"], serde_json::json!(["Left"]));
        assert_eq!(json["seq"], 1);
        // Asking for the inputs is enough to have them read for a few seconds.
        assert!(hub.inputs_wanted());
    }

    #[test]
    fn flatten_links_should_keep_api_links_inside_the_document_and_drop_the_others() {
        let text = "voir [les routes](REST_API.md#get-state), [le guide](API.md), [les réglages](SETTINGS.md#x) et [le web](https://example.com).";
        assert_eq!(
            flatten_links(text),
            "voir [les routes](#get-state), [le guide](#guide-de-lapi-locale), les réglages et [le web](https://example.com)."
        );
    }

    #[test]
    fn docs_should_hold_the_four_pages_without_dangling_file_links() {
        let text = docs_text();
        for title in [
            "# Guide de l'API locale",
            "# Routes REST",
            "# WebSocket",
            "# Modèle de données",
        ] {
            assert!(text.contains(title), "missing page {title}");
        }
        assert!(
            !text.contains(".md)"),
            "a link to a .md file is left in the served documentation"
        );
        assert!(
            !text.contains(".md#"),
            "a link to a .md file is left in the served documentation"
        );
    }

    #[test]
    fn strip_screenshots_should_drop_the_whole_block_and_its_blank_line() {
        let text =
            "before\n\n> [!SCREENSHOT] some-id\n> what it shows,\n> on two lines.\n\nafter\n";
        assert_eq!(strip_screenshots(text), "before\n\nafter\n");
        assert_eq!(strip_screenshots("> a plain quote\n"), "> a plain quote\n");
    }

    #[test]
    fn docs_should_not_hold_screenshot_placeholders() {
        assert!(!docs_text().contains("SCREENSHOT"));
    }
}
