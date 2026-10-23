#![allow(
    clippy::unwrap_used,
    reason = "a test helper: a failure here is a failed test"
)]

//! Restarting the API (new port, API switched off) must not wait for connected WebSocket clients.

use std::time::Duration;

use overlay_server::{ApiSettings, Hub};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

async fn open_websocket(addr: std::net::SocketAddr, path: &str) -> TcpStream {
    let mut stream = TcpStream::connect(addr).await.unwrap();
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\
         Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut buf = [0u8; 256];
    let n = stream.read(&mut buf).await.unwrap();
    assert!(
        buf[..n].starts_with(b"HTTP/1.1 101"),
        "not upgraded: {}",
        String::from_utf8_lossy(&buf[..n])
    );
    stream
}

#[tokio::test]
async fn stop_should_not_wait_for_connected_websockets() {
    let hub = hub();
    let server = overlay_server::start(hub, 0, None, None).await.unwrap();
    let _state = open_websocket(server.addr, "/api/v1/ws").await;
    let _inputs = open_websocket(server.addr, "/api/v1/inputs/ws").await;

    tokio::time::timeout(Duration::from_secs(3), server.stop())
        .await
        .expect("stopping the server hung while WebSocket clients were connected");
}

fn hub() -> Hub {
    Hub::new(ApiSettings {
        poll_interval_ms: 33,
        input_poll_interval_ms: 2,
        port: 0,
    })
}

/// A stopped server must also let go of the clients it had: it tells them it is going away (close
/// code 1001) so they reconnect, to the new port or never if the API is switched off, instead of
/// listening to a server that is gone.
#[tokio::test]
async fn stop_should_tell_websocket_clients_it_is_going_away() {
    let hub = hub();
    let server = overlay_server::start(hub.clone(), 0, None, None)
        .await
        .unwrap();
    let mut stream = open_websocket(server.addr, "/api/v1/ws").await;
    server.stop().await;

    // Read everything until the connection ends (the hello message may come first).
    let mut received = Vec::new();
    let ended = tokio::time::timeout(Duration::from_secs(2), async {
        let mut buf = [0u8; 4096];
        loop {
            match stream.read(&mut buf).await {
                Ok(0) | Err(_) => return,
                Ok(n) => received.extend_from_slice(&buf[..n]),
            }
        }
    })
    .await;
    assert!(
        ended.is_ok(),
        "the client is still connected to a stopped server"
    );

    // A close frame is `0x88`, its length, then the code: 1001 is `0x03E9`.
    let going_away = received
        .windows(4)
        .any(|w| w[0] == 0x88 && w[2] == 0x03 && w[3] == 0xE9);
    assert!(going_away, "no close frame with code 1001 in {received:?}");
}
