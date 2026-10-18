//! W04: one-click launch for an isolated, bundled Node 24 + SQLite demo.
//! This is not merchant provisioning, Windows service installation or cloud sync.
use reqwest::blocking::Client;
use reqwest::header::AUTHORIZATION;
use serde::Serialize;
use std::env;
use std::fs;
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[derive(Default)]
pub struct DemoRuntime(Mutex<Option<OwnedGateway>>);

struct OwnedGateway {
    child: Child,
    dir: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherState {
    running: bool,
    code: &'static str,
}

const PORT: u16 = 8787;

fn listener_present() -> bool {
    TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], PORT)),
        Duration::from_millis(180),
    ).is_ok()
}

fn secret() -> String {
    // UUID v4 is OS-CSPRNG-generated. Four independent UUIDs provide >480 bits.
    (0..4).map(|_| Uuid::new_v4().simple().to_string()).collect::<String>()
}

fn clear_demo_env() {
    for name in [
        "FOON_DESKTOP_DEMO_MODE", "FOON_DESKTOP_DEMO_BRANCH_ID",
        "FOON_LAN_TOKEN", "FOON_EDGE_ACK_SECRET", "FOON_LAN_DB",
        "FOON_LAN_HOST", "FOON_LAN_PORT", "FOON_EDGE_TENANT_ID",
        "FOON_EDGE_BRANCH_ID", "FOON_EDGE_DEVICE_ID",
        "FOON_EDGE_CLOUD_SYNC_URL", "FOON_EDGE_RECEIPT_KEYS",
        "FOON_EDGE_RECEIPT_SIGNING_KEY",
    ] { env::remove_var(name); }
}

fn health(token: &str) -> bool {
    Client::builder()
        .connect_timeout(Duration::from_millis(250))
        .timeout(Duration::from_millis(450))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .ok()
        .and_then(|client| {
            client.get("http://127.0.0.1:8787/health")
                .header(AUTHORIZATION, format!("Bearer {token}"))
                .send().ok()
        })
        .and_then(|response| {
            if !response.status().is_success() { return None; }
            response.json::<serde_json::Value>().ok()
        })
        .is_some_and(|value| value.get("ok") == Some(&serde_json::json!(true)) &&
            value.get("storage").and_then(|v| v.as_str()) == Some("sqlite-wal-full"))
}

fn shutdown_owned(owned: &mut Option<OwnedGateway>) {
    if let Some(mut runtime) = owned.take() {
        // Kill and wait only for the exact child handle we created.
        let _ = runtime.child.kill();
        let _ = runtime.child.wait();
        let _ = fs::remove_dir_all(runtime.dir);
    }
    clear_demo_env();
}

impl DemoRuntime {
    pub fn shutdown(&self) {
        if let Ok(mut owned) = self.0.lock() { shutdown_owned(&mut owned); }
    }
}

#[tauri::command]
pub fn launcher_status(state: State<'_, DemoRuntime>) -> LauncherState {
    let mut guard = match state.0.lock() {
        Ok(g) => g,
        Err(_) => return LauncherState { running: false, code: "LAUNCHER_LOCK_FAILED" },
    };
    if let Some(running) = guard.as_mut() {
        if running.child.try_wait().ok().flatten().is_none() {
            return LauncherState { running: true, code: "OWNED_DEMO_RUNNING" };
        }
        shutdown_owned(&mut guard);
    }
    LauncherState { running: false, code: "DEMO_NOT_STARTED" }
}

#[tauri::command]
pub fn start_demo_runtime(app: AppHandle, state: State<'_, DemoRuntime>) -> Result<LauncherState, String> {
    let mut guard = state.0.lock().map_err(|_| "LAUNCHER_LOCK_FAILED".to_string())?;
    if let Some(owned) = guard.as_mut() {
        if owned.child.try_wait().map_err(|_| "LAUNCHER_PROCESS_ERROR".to_string())?.is_none() {
            return Ok(LauncherState { running: true, code: "OWNED_DEMO_RUNNING" });
        }
        shutdown_owned(&mut guard);
    }
    // Deliberately refuse to attach to a pre-existing service of unknown identity.
    if listener_present() { return Err("PORT_8787_IN_USE".into()); }
    for key in [
        "FOON_EDGE_CLOUD_SYNC_URL", "FOON_EDGE_TENANT_ID", "FOON_EDGE_BRANCH_ID",
        "FOON_EDGE_DEVICE_ID", "FOON_LAN_DB", "FOON_LAN_TOKEN",
    ] {
        if env::var(key).is_ok_and(|x| !x.is_empty()) {
            return Err("EXISTING_EDGE_CONTEXT_FORBIDDEN".into());
        }
    }

    let resources = app.path().resource_dir().map_err(|_| "BUNDLED_RESOURCES_MISSING".to_string())?;
    let root = resources.join("resources").join("edge-runtime");
    let node = root.join("node.exe");
    let script = root.join("scripts").join("foon-lan-sqlite.mjs");
    let contract = root.join("scripts").join("foon-edge-sync-contract.mjs");
    let receipt = root.join("lib").join("platform").join("edge-sync-receipt-signature.mjs");
    if [node.as_path(), script.as_path(), contract.as_path(), receipt.as_path()].iter().any(|p| !p.is_file()) {
        return Err("BUNDLED_NODE24_EDGE_MISSING".into());
    }

    let dir = env::temp_dir().join(format!("FOON-W03-Demo-{}",Uuid::new_v4().simple()));
    fs::create_dir(&dir).map_err(|_| "DEMO_FOLDER_CREATE_FAILED".to_string())?;
    let token=secret();
    let ack=secret();
    let branch=Uuid::new_v4().to_string();
    let db=dir.join("orders.sqlite");

    let mut command = Command::new(node);
    command.arg(script)
        .current_dir(&root)
        .env_clear()
        .env("FOON_LAN_HOST", "127.0.0.1")
        .env("FOON_LAN_PORT", "8787")
        .env("FOON_LAN_TOKEN", &token)
        .env("FOON_EDGE_ACK_SECRET", &ack)
        .env("FOON_LAN_DB", &db)
        .env("FOON_EDGE_RECEIPT_KEYS", "{}")
        .env("FOON_EDGE_TENANT_ID", "")
        .env("FOON_EDGE_BRANCH_ID", "")
        .env("FOON_EDGE_DEVICE_ID", "")
        .env("FOON_EDGE_CLOUD_SYNC_URL", "")
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    for name in ["SystemRoot","WINDIR","TEMP","TMP","USERPROFILE"] {
        if let Some(value)=env::var_os(name) { command.env(name,value); }
    }
    let mut child=match command.spawn() {
        Ok(child)=>child,
        Err(_)=>{let _=fs::remove_dir_all(&dir);return Err("BUNDLED_NODE24_START_FAILED".into());}
    };

    let mut ready=false;
    for _ in 0..40 {
        if child.try_wait().ok().flatten().is_some() {break;}
        if health(&token) {ready=true;break;}
        thread::sleep(Duration::from_millis(90));
    }
    if !ready {
        let _=child.kill();let _=child.wait();let _=fs::remove_dir_all(&dir);
        return Err("DEMO_GATEWAY_HEALTH_FAILED".into());
    }

    // Publish native-only test credentials *after* authenticating the child.
    // No cloud identity is provisioned, and JavaScript never receives the token.
    env::set_var("FOON_DESKTOP_DEMO_MODE","1");
    env::set_var("FOON_DESKTOP_DEMO_BRANCH_ID",&branch);
    env::set_var("FOON_LAN_HOST","127.0.0.1");
    env::set_var("FOON_LAN_PORT","8787");
    env::set_var("FOON_LAN_TOKEN",&token);
    env::set_var("FOON_LAN_DB",&db);
    for key in ["FOON_EDGE_TENANT_ID","FOON_EDGE_BRANCH_ID","FOON_EDGE_DEVICE_ID","FOON_EDGE_CLOUD_SYNC_URL"] {
        env::remove_var(key);
    }
    *guard=Some(OwnedGateway{child,dir});
    Ok(LauncherState { running: true, code: "OWNED_DEMO_RUNNING" })
}

#[tauri::command]
pub fn stop_demo_runtime(state: State<'_, DemoRuntime>) -> Result<LauncherState, String> {
    let mut owned=state.0.lock().map_err(|_| "LAUNCHER_LOCK_FAILED".to_string())?;
    shutdown_owned(&mut owned);
    Ok(LauncherState { running: false, code: "DEMO_STOPPED" })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn generated_secrets_are_long_and_independent() {
        let a=secret();let b=secret();
        assert_eq!(a.len(),128);
        assert_ne!(a,b);
        assert!(a.bytes().all(|x|x.is_ascii_hexdigit()));
    }
}
