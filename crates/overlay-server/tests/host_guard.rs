#![allow(
    clippy::unwrap_used,
    reason = "a test helper: a failure here is a failed test"
)]

//! The API answers requests addressed to the local machine only: a web page reaching `127.0.0.1` through a
//! name of its own (DNS rebinding) must not be able to read the game state.

use overlay_server::{ApiSettings, Hub};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

/// The status line and body of `GET path` sent with the given `Host` header.
async fn get(addr: std::net::SocketAddr, path: &str, host: Option<&str>) -> String {
    let mut stream = TcpStream::connect(addr).await.unwrap();
    let host_line = host.map_or(String::new(), |h| format!("Host: {h}\r\n"));
    let request = format!("GET {path} HTTP/1.1\r\n{host_line}Connection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut response = Vec::new();
    stream.read_to_end(&mut response).await.unwrap();
    String::from_utf8_lossy(&response).into_owned()
}

fn hub() -> Hub {
    Hub::new(ApiSettings {
        poll_interval_ms: 33,
        input_poll_interval_ms: 2,
        port: 0,
    })
}

#[tokio::test]
async fn api_should_answer_requests_addressed_to_the_local_machine() {
    let server = overlay_server::start(hub(), 0, None, None).await.unwrap();
    for host in [
        format!("127.0.0.1:{}", server.addr.port()),
        "localhost".to_owned(),
    ] {
        let response = get(server.addr, "/api/v1/state", Some(&host)).await;
        assert!(response.starts_with("HTTP/1.1 200"), "{host}: {response}");
    }
    server.stop().await;
}

#[tokio::test]
async fn api_should_refuse_requests_addressed_to_another_name() {
    let server = overlay_server::start(hub(), 0, None, None).await.unwrap();
    for host in [Some("evil.example"), Some("evil.example:24051"), None] {
        let response = get(server.addr, "/api/v1/state", host).await;
        assert!(response.starts_with("HTTP/1.1 403"), "{host:?}: {response}");
        assert!(response.contains("forbiddenHost"), "{host:?}: {response}");
    }
    server.stop().await;
}
