#![allow(
    clippy::unwrap_used,
    reason = "a test helper: a failure here is a failed test"
)]

//! `GET /api/v1/images/{id}` serves the imported pictures, and only those.

use overlay_server::{ApiSettings, Hub, images};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3];

async fn get(addr: std::net::SocketAddr, path: &str) -> String {
    let mut stream = TcpStream::connect(addr).await.unwrap();
    let request = format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut response = Vec::new();
    stream.read_to_end(&mut response).await.unwrap();
    String::from_utf8_lossy(&response).into_owned()
}

#[tokio::test]
async fn images_route_should_serve_an_imported_picture_and_refuse_everything_else() {
    let dir = std::env::temp_dir().join(format!("yar-images-route-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let secret = dir.parent().unwrap().join("yar-secret.png");
    std::fs::write(&secret, PNG).unwrap();
    let info = images::import(&dir, PNG).unwrap();
    let hub = Hub::new(ApiSettings {
        poll_interval_ms: 33,
        input_poll_interval_ms: 2,
        port: 0,
    });
    let server = overlay_server::start_with_images(hub, 0, None, None, Some(dir.clone()))
        .await
        .unwrap();

    let ok = get(server.addr, &format!("/api/v1/images/{}", info.id)).await;
    assert!(ok.starts_with("HTTP/1.1 200"), "{ok}");
    assert!(
        ok.to_ascii_lowercase().contains("content-type: image/png"),
        "{ok}"
    );
    assert!(
        ok.to_ascii_lowercase()
            .contains("x-content-type-options: nosniff"),
        "{ok}"
    );

    for bad in [
        "/api/v1/images/..%2Fyar-secret.png",
        "/api/v1/images/..%5Cyar-secret.png",
        "/api/v1/images/yar-secret.png",
        "/api/v1/images/00000000000000000000000000000000.png",
        "/api/v1/images/",
    ] {
        let response = get(server.addr, bad).await;
        assert!(response.starts_with("HTTP/1.1 404"), "{bad}: {response}");
    }
    server.stop().await;
    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_file(secret);
}

#[tokio::test]
async fn images_route_should_answer_404_without_an_images_folder() {
    let hub = Hub::new(ApiSettings {
        poll_interval_ms: 33,
        input_poll_interval_ms: 2,
        port: 0,
    });
    let server = overlay_server::start(hub, 0, None, None).await.unwrap();
    let id = format!("{}.png", "ab".repeat(16));
    let response = get(server.addr, &format!("/api/v1/images/{id}")).await;
    assert!(response.starts_with("HTTP/1.1 404"), "{response}");
    server.stop().await;
}
