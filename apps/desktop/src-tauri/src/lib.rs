mod demo_orders;
mod edge_runtime;
#[cfg(windows)]
mod windows_secret_store;
#[cfg(windows)]
mod native_cloud_receipt;
#[cfg(windows)]
mod protected_receipt_path;
#[cfg(windows)]
mod native_event_digest;
#[cfg(windows)]
mod native_outbox_readonly;
#[cfg(all(test, windows))]
mod native_ack_sandbox;
use tauri::Manager;
use serde::Serialize;
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

use std::env;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewayStatus {
    status: &'static str,
    pending: Option<u64>,
    note: &'static str,
}

#[derive(serde::Deserialize)]
struct GatewayHealth {
    ok: bool,
    storage: String,
    pending: u64,
}

/// A *read-only* authenticated request, performed inside native Rust.
/// Never return the bearer token, error body, or request headers to JavaScript.
/// This does not start the service, enroll a device, or prove the OS process identity.
#[tauri::command]
fn gateway_status() -> GatewayStatus {
    let token = match env::var("FOON_LAN_TOKEN") {
        Ok(value)
            if (32..=256).contains(&value.len())
                && value.bytes().all(|c| c.is_ascii_alphanumeric() || b"-._~".contains(&c)) =>
        {
            value
        }
        _ => {
            return GatewayStatus {
                status: "not_configured",
                pending: None,
                note: "Native local gateway credentials are not configured",
            }
        }
    };
    let client = match reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_millis(450))
        .timeout(Duration::from_millis(1500))
        .redirect(reqwest::redirect::Policy::none())
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            return GatewayStatus {
                status: "unavailable",
                pending: None,
                note: "Local gateway inspection is unavailable",
            }
        }
    };
    let response = client
        .get("http://127.0.0.1:8787/health")
        .header(reqwest::header::AUTHORIZATION, format!("Bearer {token}"))
        .send();
    let response = match response {
        Ok(response) => response,
        Err(_) => {
            return GatewayStatus {
                status: "not_running",
                pending: None,
                note: "No authenticated response from the local gateway",
            }
        }
    };
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return GatewayStatus {
            status: "unauthorized",
            pending: None,
            note: "Local service rejected the configured native token",
        };
    }
    if !response.status().is_success() {
        return GatewayStatus {
            status: "unavailable",
            pending: None,
            note: "Local service health check failed",
        };
    }
    match response.json::<GatewayHealth>() {
        Ok(health) if health.ok && health.storage == "sqlite-wal-full" => GatewayStatus {
            status: "authenticated",
            pending: Some(health.pending),
            note: "Authenticated SQLite gateway response; no cloud sync is asserted",
        },
        _ => GatewayStatus {
            status: "unexpected_response",
            pending: None,
            note: "The local port is not returning a recognized FOON SQLite health response",
        },
    }
}


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
    let app = tauri::Builder::default()
        .manage(edge_runtime::DemoRuntime::default())
        .invoke_handler(tauri::generate_handler![
            station_status, gateway_status,
            demo_orders::demo_status, demo_orders::demo_list_orders,
            demo_orders::demo_create_order, demo_orders::demo_update_order,
            edge_runtime::launcher_status, edge_runtime::start_demo_runtime,
            edge_runtime::stop_demo_runtime,
            edge_runtime::start_durable_test_runtime,
            edge_runtime::stop_durable_test_runtime,
            edge_runtime::inspect_durable_sqlite
        ])
        .build(tauri::generate_context!())
        .expect("Unable to build FOON desktop shell");
    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            app_handle.state::<edge_runtime::DemoRuntime>().shutdown();
        }
    });
}
