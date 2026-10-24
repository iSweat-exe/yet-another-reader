//! `GET /api/v1/ws`: pushes state changes, status changes and derived events.

use std::collections::HashSet;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::Response;
use futures_util::SinkExt;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::watch;

use crate::API_VERSION;
use crate::hub::{Hub, InputUpdate, Update, json_value};
use crate::routes::{ApiError, AppState};

/// Top-level keys of the game state, accepted by `?topics=`.
pub const TOPICS: &[&str] = &[
    "connected",
    "version",
    "screen",
    "screenType",
    "playing",
    "ruleset",
    "mods",
    "beatmap",
    "difficulty",
    "difficultyGraph",
    "time",
    "user",
    "spectators",
    "spectatorCount",
    "gameplay",
];

#[derive(Debug, Deserialize)]
pub struct WsQuery {
    /// Comma separated subset of [`TOPICS`]; omitted means everything.
    topics: Option<String>,
    /// `false` to stop receiving `event` messages (default `true`).
    events: Option<bool>,
}

pub async fn handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<WsQuery>,
) -> Result<Response, ApiError> {
    let topics = parse_topics(query.topics.as_deref())?;
    let events = query.events.unwrap_or(true);
    let stop = state.shutdown.subscribe();
    Ok(ws.on_upgrade(move |socket| session(socket, state.hub, topics, events, stop)))
}

fn parse_topics(raw: Option<&str>) -> Result<Option<HashSet<String>>, ApiError> {
    let Some(raw) = raw.filter(|r| !r.trim().is_empty()) else {
        return Ok(None);
    };
    let mut set = HashSet::new();
    for topic in raw.split(',').map(str::trim) {
        if !TOPICS.contains(&topic) {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "invalidTopic",
                format!(
                    "unknown topic {topic:?}; valid topics: {}",
                    TOPICS.join(", ")
                ),
            ));
        }
        set.insert(topic.to_owned());
    }
    Ok(Some(set))
}

/// Keeps only the requested top-level keys (plus `connected`, which clients always need).
fn project(state: &Value, topics: &Option<HashSet<String>>) -> Value {
    let (Some(topics), Value::Object(map)) = (topics, state) else {
        return state.clone();
    };
    Value::Object(
        map.iter()
            .filter(|(k, _)| *k == "connected" || topics.contains(k.as_str()))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
    )
}

/// Resolves when the server is stopping (never if nobody can stop it).
async fn stopping(stop: &mut watch::Receiver<bool>) {
    if stop.wait_for(|stopping| *stopping).await.is_err() {
        std::future::pending::<()>().await;
    }
}

/// Tells the client the server is going away, so it knows to reconnect.
async fn say_goodbye(socket: &mut WebSocket) {
    let frame = CloseFrame {
        code: 1001,
        reason: "server stopping".into(),
    };
    let _ = socket.send(Message::Close(Some(frame))).await;
}

async fn send(socket: &mut WebSocket, message: Value) -> bool {
    socket
        .send(Message::Text(message.to_string().into()))
        .await
        .is_ok()
}

async fn session(
    mut socket: WebSocket,
    hub: Hub,
    topics: Option<HashSet<String>>,
    events: bool,
    mut stop: watch::Receiver<bool>,
) {
    // Subscribe before reading the snapshot so no update can slip between the two.
    let mut rx = hub.subscribe();
    let (seq, state) = hub.game_json();
    let hello = json!({
        "type": "hello",
        "apiVersion": API_VERSION,
        "seq": seq,
        "settings": hub.settings(),
        "status": hub.status(),
        "data": project(&state, &topics),
    });
    if !send(&mut socket, hello).await {
        return;
    }

    loop {
        tokio::select! {
            () = stopping(&mut stop) => {
                say_goodbye(&mut socket).await;
                break;
            }
            update = rx.recv() => {
                let message = match update {
                    Ok(Update::State { seq, state }) => json!({ "type": "state", "seq": seq, "data": project(&state, &topics) }),
                    Ok(Update::Status { seq, status }) => json!({ "type": "status", "seq": seq, "data": status }),
                    Ok(Update::Event { seq, event }) if events => json!({ "type": "event", "seq": seq, "event": json_value(&*event) }),
                    Ok(Update::Event { .. }) => continue,
                    // Too slow: skip the backlog and resynchronise with the current state.
                    Err(RecvError::Lagged(_)) => {
                        let (seq, state) = hub.game_json();
                        json!({ "type": "state", "seq": seq, "data": project(&state, &topics) })
                    }
                    Err(RecvError::Closed) => break,
                };
                if !send(&mut socket, message).await {
                    break;
                }
            }
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    if text.trim().contains("\"ping\"") && !send(&mut socket, json!({ "type": "pong" })).await {
                        break;
                    }
                }
                Some(Ok(Message::Close(_)) | Err(_)) | None => break,
                Some(Ok(_)) => {}
            },
        }
    }
    // Answer the client's close frame: dropping the socket would show up as an abnormal closure (1006).
    let _ = socket.close().await;
}

/// `GET /api/v1/inputs/ws`: the held keys and mouse buttons, pushed on every change.
///
/// Apart from the game state, which is sampled a few dozen times a second, the inputs are read in
/// their own fast loop (`inputPollIntervalMs`, 2 ms by default) and pushed as they change, so an
/// overlay of the keys follows the player in real time. The inputs are only read while at least one
/// client (or window of the app) is listening.
pub async fn inputs_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    let stop = state.shutdown.subscribe();
    ws.on_upgrade(move |socket| inputs_session(socket, state.hub, stop))
}

fn input_message(update: &InputUpdate) -> Value {
    json!({
        "type": "input",
        "seq": update.seq,
        "at": update.at,
        "data": &*update.state,
    })
}

async fn inputs_session(mut socket: WebSocket, hub: Hub, mut stop: watch::Receiver<bool>) {
    // Registering first makes the reader start sampling; subscribing before the snapshot means no
    // change can slip between the two.
    let _watch = hub.watch_inputs();
    let mut rx = hub.subscribe_inputs();
    let current = hub.inputs();
    let hello = json!({
        "type": "hello",
        "apiVersion": API_VERSION,
        "intervalMs": hub.settings().input_poll_interval_ms,
        "seq": current.seq,
        "at": current.at,
        "data": current.state,
    });
    if !send(&mut socket, hello).await {
        return;
    }
    loop {
        tokio::select! {
            () = stopping(&mut stop) => {
                say_goodbye(&mut socket).await;
                break;
            }
            update = rx.recv() => {
                let message = match update {
                    Ok(update) => input_message(&update),
                    // Too slow: skip the backlog and resynchronise with what is held now.
                    Err(RecvError::Lagged(_)) => {
                        let now = hub.inputs();
                        json!({ "type": "input", "seq": now.seq, "at": now.at, "data": now.state })
                    }
                    Err(RecvError::Closed) => break,
                };
                if !send(&mut socket, message).await {
                    break;
                }
            }
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    if text.trim().contains("\"ping\"") && !send(&mut socket, json!({ "type": "pong" })).await {
                        break;
                    }
                }
                Some(Ok(Message::Close(_)) | Err(_)) | None => break,
                Some(Ok(_)) => {}
            },
        }
    }
    // Answer the client's close frame: dropping the socket would show up as an abnormal closure (1006).
    let _ = socket.close().await;
}

/// Names of the events, accepted by `?names=` on `/events/ws`.
pub const EVENT_NAMES: &[&str] = &[
    "connectionChanged",
    "screenChanged",
    "beatmapChanged",
    "modsChanged",
    "playStarted",
    "playEnded",
    "paused",
    "resumed",
    "failed",
    "hit",
    "miss",
    "comboBreak",
];

#[derive(Debug, Deserialize)]
pub struct EventsQuery {
    /// Comma separated subset of [`EVENT_NAMES`]; omitted means every event.
    names: Option<String>,
}

fn parse_names(raw: Option<&str>) -> Result<Option<HashSet<String>>, ApiError> {
    let Some(raw) = raw.filter(|r| !r.trim().is_empty()) else {
        return Ok(None);
    };
    let mut set = HashSet::new();
    for name in raw.split(',').map(str::trim) {
        if !EVENT_NAMES.contains(&name) {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "invalidEvent",
                format!(
                    "unknown event {name:?}; valid events: {}",
                    EVENT_NAMES.join(", ")
                ),
            ));
        }
        set.insert(name.to_owned());
    }
    Ok(Some(set))
}

/// `GET /api/v1/events/ws`: only the discrete events (a note hit, a miss, a play started...), no state.
pub async fn events_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<EventsQuery>,
) -> Result<Response, ApiError> {
    let names = parse_names(query.names.as_deref())?;
    let stop = state.shutdown.subscribe();
    Ok(ws.on_upgrade(move |socket| events_session(socket, state.hub, names, stop)))
}

async fn events_session(
    mut socket: WebSocket,
    hub: Hub,
    names: Option<HashSet<String>>,
    mut stop: watch::Receiver<bool>,
) {
    let mut rx = hub.subscribe();
    let hello = json!({ "type": "hello", "apiVersion": API_VERSION, "events": EVENT_NAMES });
    if !send(&mut socket, hello).await {
        return;
    }
    loop {
        tokio::select! {
            () = stopping(&mut stop) => {
                say_goodbye(&mut socket).await;
                break;
            }
            update = rx.recv() => match update {
                Ok(Update::Event { seq, event }) => {
                    let event = json_value(&*event);
                    let wanted = names.as_ref().is_none_or(|set| {
                        event.get("name").and_then(Value::as_str).is_some_and(|n| set.contains(n))
                    });
                    if wanted && !send(&mut socket, json!({ "type": "event", "seq": seq, "event": event })).await {
                        break;
                    }
                }
                // State and status are not wanted here; a lagging client just misses some events.
                Ok(_) | Err(RecvError::Lagged(_)) => {}
                Err(RecvError::Closed) => break,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    if text.trim().contains("\"ping\"") && !send(&mut socket, json!({ "type": "pong" })).await {
                        break;
                    }
                }
                Some(Ok(Message::Close(_)) | Err(_)) | None => break,
                Some(Ok(_)) => {}
            },
        }
    }
    let _ = socket.close().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_names_should_reject_unknown_events() {
        assert!(parse_names(Some("hit,nope")).is_err());
        assert!(parse_names(Some("hit, miss")).unwrap().is_some());
        assert!(parse_names(None).unwrap().is_none());
    }

    #[test]
    fn parse_topics_should_accept_known_topics() {
        let set = parse_topics(Some("beatmap, gameplay")).unwrap().unwrap();
        assert!(set.contains("beatmap") && set.contains("gameplay"));
    }

    #[test]
    fn parse_topics_should_reject_unknown_topics() {
        assert!(parse_topics(Some("beatmap,nope")).is_err());
    }

    #[test]
    fn parse_topics_should_treat_empty_as_everything() {
        assert!(parse_topics(Some(" ")).unwrap().is_none());
        assert!(parse_topics(None).unwrap().is_none());
    }

    #[test]
    fn project_should_keep_requested_keys_and_connected() {
        let state = json!({ "connected": true, "beatmap": 1, "gameplay": 2, "user": 3 });
        let topics = Some(HashSet::from(["gameplay".to_owned()]));
        assert_eq!(
            project(&state, &topics),
            json!({ "connected": true, "gameplay": 2 })
        );
    }
}
