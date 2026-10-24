//! Local HTTP + WebSocket API that publishes the osu!lazer game state to overlays.
//!
//! The server only ever binds to `127.0.0.1` and exposes read-only data. See
//! `docs/API.md` (guide), `docs/REST_API.md`, `docs/WEBSOCKET.md` and `docs/DATA_MODEL.md` for the full
//! reference (also served at `/api/v1/docs`). Run the `sample` example to try the API without the game.

#![warn(clippy::must_use_candidate)]

mod hub;
pub mod images;
mod routes;
pub mod widgets;
mod ws;

use std::io;
use std::net::{Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;

use axum::Router;
use axum::extract::{Request, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use tokio::net::TcpListener;
use tokio::sync::{oneshot, watch};
use tokio::task::JoinHandle;
use tower_http::cors::CorsLayer;
use tower_http::set_header::SetResponseHeaderLayer;

pub use hub::{
    ApiSettings, Hub, InputConsumers, InputSnapshot, InputUpdate, InputWatch, Snapshot, Update,
};
pub use routes::docs_text;

/// Version of the HTTP/WebSocket contract; bumped only on breaking changes.
pub const API_VERSION: u32 = 1;

use routes::{ApiError, AppState, Asset};

async fn not_found() -> ApiError {
    ApiError::new(
        StatusCode::NOT_FOUND,
        "notFound",
        "no such endpoint; see /api/v1",
    )
}

/// Whether the `Host` header of a request names this machine (`127.0.0.1`, `localhost`, `[::1]`).
fn is_local_host(host: &str) -> bool {
    let name = match host.strip_prefix('[') {
        Some(rest) => rest.split(']').next().unwrap_or_default(),
        None => host.split(':').next().unwrap_or_default(),
    };
    let name = name.to_ascii_lowercase();
    matches!(name.as_str(), "127.0.0.1" | "localhost" | "::1") || name.ends_with(".localhost")
}

/// Refuses requests addressed to anything but the local machine. A web page can make the browser send
/// requests to `127.0.0.1` through a name it controls (DNS rebinding); the `Host` header then still carries
/// that name, so checking it keeps such a page from reading the game state.
async fn require_local_host(req: Request, next: Next) -> Response {
    let local = req
        .headers()
        .get(header::HOST)
        .and_then(|host| host.to_str().ok())
        .is_some_and(is_local_host);
    if local {
        next.run(req).await
    } else {
        ApiError::new(
            StatusCode::FORBIDDEN,
            "forbiddenHost",
            "this API only answers requests addressed to 127.0.0.1 or localhost",
        )
        .into_response()
    }
}

pub fn router(hub: Hub, storage_root: Option<PathBuf>, widgets_dir: Option<PathBuf>) -> Router {
    router_with_shutdown(
        hub,
        storage_root,
        widgets_dir,
        None,
        Arc::new(watch::channel(false).0),
    )
}

/// Like [`router`], with the signal that tells open WebSockets the server is stopping.
fn router_with_shutdown(
    hub: Hub,
    storage_root: Option<PathBuf>,
    widgets_dir: Option<PathBuf>,
    images_dir: Option<PathBuf>,
    shutdown: Arc<watch::Sender<bool>>,
) -> Router {
    let state = AppState {
        hub,
        storage_root: storage_root.map(Arc::new),
        widgets_dir: widgets_dir.clone().map(Arc::new),
        images_dir: images_dir.map(Arc::new),
        shutdown,
    };
    let mut app = Router::new()
        .route("/api/v1", get(routes::index))
        .route("/api/v1/health", get(routes::health))
        .route("/api/v1/status", get(routes::status))
        .route("/api/v1/settings", get(routes::settings))
        .route("/api/v1/snapshot", get(routes::snapshot))
        .route("/api/v1/state", get(routes::state))
        .route("/api/v1/screen", get(routes::screen))
        .route("/api/v1/beatmap", get(routes::beatmap))
        .route("/api/v1/difficulty", get(routes::difficulty))
        .route("/api/v1/difficulty-graph", get(routes::difficulty_graph))
        .route("/api/v1/mods", get(routes::mods))
        .route("/api/v1/time", get(routes::time))
        .route("/api/v1/user", get(routes::user))
        .route("/api/v1/gameplay", get(routes::gameplay))
        .route("/api/v1/pp", get(routes::pp))
        .route("/api/v1/hit-errors", get(routes::hit_errors))
        .route("/api/v1/inputs", get(routes::inputs))
        .route("/api/v1/inputs/ws", get(ws::inputs_handler))
        .route(
            "/api/v1/assets/background",
            get(|State(s): State<AppState>, req: Request| routes::asset(Asset::Background, s, req)),
        )
        .route(
            "/api/v1/assets/audio",
            get(|State(s): State<AppState>, req: Request| routes::asset(Asset::Audio, s, req)),
        )
        .route("/api/v1/images/{id}", get(routes::image))
        .route("/api/v1/widgets", get(routes::widgets))
        .route("/api/v1/docs", get(routes::docs))
        .route("/api/v1/ws", get(ws::handler))
        .fallback(not_found)
        .with_state(state);
    // Community widgets: plain static files, served from their folders only.
    if let Some(dir) = widgets_dir {
        app = app.nest_service("/widgets", tower_http::services::ServeDir::new(dir));
    }
    app
        // Overlays are usually web pages (OBS browser sources, local files): allow any origin.
        .layer(CorsLayer::permissive())
        .layer(SetResponseHeaderLayer::if_not_present(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
}

/// A running API server; dropping it does not stop it, call [`RunningServer::stop`].
pub struct RunningServer {
    pub addr: SocketAddr,
    stop: Option<oneshot::Sender<()>>,
    shutdown: Arc<watch::Sender<bool>>,
    task: JoinHandle<()>,
}

impl RunningServer {
    /// Stops accepting connections, closes the open WebSockets (code 1001, "going away", so their
    /// clients reconnect) and waits for the server task to finish.
    pub async fn stop(mut self) {
        let _ = self.shutdown.send(true);
        if let Some(tx) = self.stop.take() {
            let _ = tx.send(());
        }
        let _ = self.task.await;
    }
}

/// Binds `127.0.0.1:port` and serves the API in the background.
pub async fn start(
    hub: Hub,
    port: u16,
    storage_root: Option<PathBuf>,
    widgets_dir: Option<PathBuf>,
) -> io::Result<RunningServer> {
    start_with_images(hub, port, storage_root, widgets_dir, None).await
}

/// Like [`start`], also serving the pictures of `images_dir` (see [`images`]) at `/api/v1/images/{id}`.
pub async fn start_with_images(
    hub: Hub,
    port: u16,
    storage_root: Option<PathBuf>,
    widgets_dir: Option<PathBuf>,
    images_dir: Option<PathBuf>,
) -> io::Result<RunningServer> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await?;
    let addr = listener.local_addr()?;
    let (stop, stopped) = oneshot::channel::<()>();
    let shutdown = Arc::new(watch::channel(false).0);
    let app = router_with_shutdown(
        hub,
        storage_root,
        widgets_dir,
        images_dir,
        Arc::clone(&shutdown),
    )
    .layer(middleware::from_fn(require_local_host));
    let task = tokio::spawn(async move {
        let served = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = stopped.await;
            })
            .await;
        if let Err(e) = served {
            tracing::error!("API server stopped: {e}");
        }
    });
    Ok(RunningServer {
        addr,
        stop: Some(stop),
        shutdown,
        task,
    })
}

#[cfg(test)]
mod tests {
    use super::is_local_host;

    #[test]
    fn is_local_host_should_accept_the_loopback_names_with_or_without_a_port() {
        for host in [
            "127.0.0.1",
            "127.0.0.1:24051",
            "localhost",
            "LOCALHOST:3000",
            "[::1]:24051",
            "[::1]",
            "app.localhost:80",
        ] {
            assert!(is_local_host(host), "{host} should be accepted");
        }
    }

    #[test]
    fn is_local_host_should_refuse_other_names() {
        for host in [
            "",
            "evil.example",
            "evil.example:24051",
            "127.0.0.1.evil.example",
            "localhost.evil.example",
            "192.168.1.5:24051",
            "[2001:db8::1]:80",
        ] {
            assert!(!is_local_host(host), "{host} should be refused");
        }
    }
}
