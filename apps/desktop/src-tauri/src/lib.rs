use serde::Serialize;
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StationStatus {
    shell: &'static str,
    local_console_listener: bool,
    console_address: &'static str,
    note: &'static str,
}

/// This probe deliberately does not send secrets, assume authentication or start Edge.
#[tauri::command]
fn station_status() -> StationStatus {
    let address = SocketAddr::from(([127, 0, 0, 1], 8788));
    let listener = TcpStream::connect_timeout(&address, Duration::from_millis(350)).is_ok();
    StationStatus {
        shell: "native",
        local_console_listener: listener,
        console_address: "127.0.0.1:8788",
        note: "TCP listener detected only; identity, health and authentication are not verified",
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![station_status])
        .run(tauri::generate_context!())
        .expect("Unable to start FOON desktop shell");
}
