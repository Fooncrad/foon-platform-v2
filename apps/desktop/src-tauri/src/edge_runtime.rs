//! W04: one-click launch for an isolated, bundled Node 24 + SQLite demo.
//! This is not merchant provisioning, Windows service installation or cloud sync.
use reqwest::blocking::Client;
use reqwest::header::AUTHORIZATION;
use serde::Serialize;
use std::env;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use fs2::FileExt;
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

#[derive(Copy, Clone, Eq, PartialEq)]
enum RuntimeMode { Temporary, Durable }
impl RuntimeMode {
    fn label(self) -> &'static str {
        match self { Self::Temporary => "temporary", Self::Durable => "durable" }
    }
}
struct OwnedGateway {
    child: Child,
    dir: PathBuf,
    mode: RuntimeMode,
    lock: Option<File>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherState {
    running: bool,
    code: &'static str,
    mode: &'static str,
}
fn launcher(running: bool, code: &'static str, mode: &'static str) -> LauncherState {
    LauncherState {running,code,mode}
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
        "FOON_DESKTOP_DEMO_MODE", "FOON_DESKTOP_DURABLE_TEST", "FOON_DESKTOP_DEMO_BRANCH_ID",
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
        if runtime.mode == RuntimeMode::Temporary {
            let _ = fs::remove_dir_all(runtime.dir);
        }
        drop(runtime.lock.take());
        clear_demo_env();
    }
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
        Err(_) => return launcher(false,"LAUNCHER_LOCK_FAILED","none"),
    };
    if let Some(running) = guard.as_mut() {
        if running.child.try_wait().ok().flatten().is_none() {
            return launcher(true,"OWNED_DEMO_RUNNING",running.mode.label());
        }
        shutdown_owned(&mut guard);
    }
    launcher(false,"DEMO_NOT_STARTED","none")
}

#[tauri::command]
pub fn start_demo_runtime(app: AppHandle, state: State<'_, DemoRuntime>) -> Result<LauncherState, String> {
    start_runtime(app,state,RuntimeMode::Temporary)
}

#[tauri::command]
pub fn start_durable_test_runtime(app: AppHandle, state: State<'_, DemoRuntime>) -> Result<LauncherState, String> {
    start_runtime(app,state,RuntimeMode::Durable)
}

fn start_runtime(app: AppHandle, state: State<'_, DemoRuntime>, mode: RuntimeMode) -> Result<LauncherState,String> {
    let mut guard = state.0.lock().map_err(|_| "LAUNCHER_LOCK_FAILED".to_string())?;
    if let Some(owned) = guard.as_mut() {
        if owned.child.try_wait().map_err(|_| "LAUNCHER_PROCESS_ERROR".to_string())?.is_none() {
            if owned.mode != mode { return Err("OTHER_DEMO_MODE_RUNNING".into()); }
            return Ok(launcher(true,"OWNED_DEMO_RUNNING",owned.mode.label()));
        }
        shutdown_owned(&mut guard);
    }
    // Deliberately refuse to attach to a pre-existing service of unknown identity.
    if listener_present() { return Err("PORT_8787_IN_USE".into()); }
    for key in [
        "FOON_EDGE_CLOUD_SYNC_URL", "FOON_EDGE_TENANT_ID", "FOON_EDGE_BRANCH_ID",
        "FOON_EDGE_DEVICE_ID", "FOON_LAN_DB", "FOON_LAN_TOKEN",
        "FOON_DESKTOP_DEMO_MODE", "FOON_DESKTOP_DURABLE_TEST",
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

    let (dir,branch,lock)=match mode {
        RuntimeMode::Temporary => {
            let dir=env::temp_dir().join(format!("FOON-W03-Demo-{}",Uuid::new_v4().simple()));
            fs::create_dir(&dir).map_err(|_| "DEMO_FOLDER_CREATE_FAILED".to_string())?;
            (dir,Uuid::new_v4().to_string(),None)
        }
        RuntimeMode::Durable => {
            let dir=durable_test_dir(&app)?;
            let lock_file=OpenOptions::new().create(true).read(true).write(true)
                .open(dir.join("w05.lock")).map_err(|_| "DURABLE_LOCK_OPEN_FAILED".to_string())?;
            lock_file.try_lock_exclusive().map_err(|_| "DURABLE_DB_IN_USE".to_string())?;
            let branch=load_or_create_branch(&dir)?;
            (dir,branch,Some(lock_file))
        }
    };
    let token=secret();
    let ack=secret();
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
        .env("FOON_EDGE_BRANCH_ID", if mode==RuntimeMode::Durable {branch.as_str()} else {""})
        .env("FOON_EDGE_DEVICE_ID", "")
        .env("FOON_EDGE_CLOUD_SYNC_URL", "")
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    for name in ["SystemRoot","WINDIR","TEMP","TMP","USERPROFILE"] {
        if let Some(value)=env::var_os(name) { command.env(name,value); }
    }
    let mut child=match command.spawn() {
        Ok(child)=>child,
        Err(_)=>{if mode==RuntimeMode::Temporary {let _=fs::remove_dir_all(&dir);} return Err("BUNDLED_NODE24_START_FAILED".into());}
    };

    let mut ready=false;
    for _ in 0..40 {
        if child.try_wait().ok().flatten().is_some() {break;}
        if health(&token) {ready=true;break;}
        thread::sleep(Duration::from_millis(90));
    }
    if !ready {
        let _=child.kill();let _=child.wait();if mode==RuntimeMode::Temporary {let _=fs::remove_dir_all(&dir);}
        return Err("DEMO_GATEWAY_HEALTH_FAILED".into());
    }

    // Publish native-only test credentials *after* authenticating the child.
    // No cloud identity is provisioned, and JavaScript never receives the token.
    env::set_var("FOON_DESKTOP_DEMO_MODE","1");
    if mode==RuntimeMode::Durable {env::set_var("FOON_DESKTOP_DURABLE_TEST","1");}
    else {env::remove_var("FOON_DESKTOP_DURABLE_TEST");}
    env::set_var("FOON_DESKTOP_DEMO_BRANCH_ID",&branch);
    env::set_var("FOON_LAN_HOST","127.0.0.1");
    env::set_var("FOON_LAN_PORT","8787");
    env::set_var("FOON_LAN_TOKEN",&token);
    env::set_var("FOON_LAN_DB",&db);
    for key in ["FOON_EDGE_TENANT_ID","FOON_EDGE_BRANCH_ID","FOON_EDGE_DEVICE_ID","FOON_EDGE_CLOUD_SYNC_URL"] {
        env::remove_var(key);
    }
    if mode==RuntimeMode::Durable {
        // Native-only synthetic branch scope. Cloud tenant/device remain unset.
        env::set_var("FOON_EDGE_BRANCH_ID",&branch);
    }
    *guard=Some(OwnedGateway{child,dir,mode,lock});
    Ok(launcher(true,"OWNED_DEMO_RUNNING",mode.label()))
}

#[tauri::command]
pub fn stop_demo_runtime(state: State<'_, DemoRuntime>) -> Result<LauncherState, String> {
    let mut owned=state.0.lock().map_err(|_| "LAUNCHER_LOCK_FAILED".to_string())?;
    if owned.as_ref().is_some_and(|runtime| runtime.mode != RuntimeMode::Temporary) {return Err("OTHER_DEMO_MODE_RUNNING".into());}
    shutdown_owned(&mut owned);
    Ok(launcher(false,"DEMO_STOPPED","none"))
}


/// Fixed, per-user Windows location; it is never supplied by web UI or environment as a DB path.
fn durable_test_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let local=env::var_os("LOCALAPPDATA").map(PathBuf::from)
        .ok_or_else(|| "WINDOWS_LOCALAPPDATA_REQUIRED".to_string())?;
    let base=app.path().app_local_data_dir()
        .map_err(|_| "APP_LOCAL_DATA_UNAVAILABLE".to_string())?;
    if base != local.join("com.foon.desktop") {
        return Err("DURABLE_DIRECTORY_UNEXPECTED".into());
    }
    fs::create_dir_all(&base).map_err(|_| "DURABLE_DIRECTORY_UNAVAILABLE".to_string())?;
    let dir=base.join("w05-durable-test");
    fs::create_dir_all(&dir).map_err(|_| "DURABLE_DIRECTORY_UNAVAILABLE".to_string())?;
    for candidate in [&base,&dir] {
        if fs::symlink_metadata(candidate).map_err(|_| "DURABLE_DIRECTORY_UNAVAILABLE".to_string())?
            .file_type().is_symlink() {
            return Err("DURABLE_SYMLINK_FORBIDDEN".into());
        }
    }
    let base_real=base.canonicalize().map_err(|_| "DURABLE_DIRECTORY_UNAVAILABLE".to_string())?;
    let dir_real=dir.canonicalize().map_err(|_| "DURABLE_DIRECTORY_UNAVAILABLE".to_string())?;
    if dir_real.parent()!=Some(base_real.as_path()) {return Err("DURABLE_DIRECTORY_FORBIDDEN".into());}
    // Reject a pre-existing SQLite DB, WAL, lock or manifest that is a link or directory.
    for file in ["orders.sqlite","orders.sqlite-wal","orders.sqlite-shm","demo-branch.txt","w05.lock"] {
        let path=dir_real.join(file);
        match fs::symlink_metadata(&path) {
            Ok(meta) if !meta.is_file() || meta.file_type().is_symlink() => {
                return Err("DURABLE_DATA_ENTRY_FORBIDDEN".into());
            }
            Err(e) if e.kind()==std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("DURABLE_DATA_ENTRY_INACCESSIBLE".into()),
            _ => {}
        }
    }
    Ok(dir_real)
}

/// Stable NON-SECRET synthetic branch; never regenerate metadata for an existing SQLite DB.
fn load_or_create_branch(dir: &PathBuf) -> Result<String, String> {
    let file=dir.join("demo-branch.txt");
    if file.exists() {
        let raw=fs::read_to_string(&file).map_err(|_| "DURABLE_BRANCH_READ_FAILED".to_string())?;
        let value=raw.trim();
        let parsed=Uuid::parse_str(value).map_err(|_| "DURABLE_BRANCH_INVALID".to_string())?;
        if value!=parsed.to_string() {return Err("DURABLE_BRANCH_INVALID".into());}
        return Ok(value.to_string());
    }
    if ["orders.sqlite","orders.sqlite-wal","orders.sqlite-shm"].iter()
        .any(|name|dir.join(name).exists()) {
        return Err("DURABLE_BRANCH_MISSING_FOR_EXISTING_DB".into());
    }
    let branch=Uuid::new_v4().to_string();
    let mut writer=OpenOptions::new().write(true).create_new(true)
        .open(&file).map_err(|_| "DURABLE_BRANCH_CREATE_FAILED".to_string())?;
    writer.write_all(branch.as_bytes()).map_err(|_| "DURABLE_BRANCH_WRITE_FAILED".to_string())?;
    writer.sync_all().map_err(|_| "DURABLE_BRANCH_FLUSH_FAILED".to_string())?;
    Ok(branch)
}

#[tauri::command]
pub fn stop_durable_test_runtime(state: State<'_, DemoRuntime>) -> Result<LauncherState, String> {
    let mut guard=state.0.lock().map_err(|_| "LAUNCHER_LOCK_FAILED".to_string())?;
    if guard.as_ref().is_some_and(|runtime|runtime.mode!=RuntimeMode::Durable) {
        return Err("OTHER_DEMO_MODE_RUNNING".into());
    }
    shutdown_owned(&mut guard);
    Ok(launcher(false,"DURABLE_TEST_STOPPED","none"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn durable_branch_id_survives_a_new_gateway_session() {
        let dir=env::temp_dir().join(format!("foon-w05-branch-unit-{}",Uuid::new_v4().simple()));
        fs::create_dir(&dir).expect("create isolated temporary fixture");
        let first=load_or_create_branch(&dir).expect("initial identity");
        let next=load_or_create_branch(&dir).expect("reopen identity");
        assert_eq!(first,next);
        assert!(Uuid::parse_str(&first).is_ok());
        fs::remove_dir_all(&dir).expect("remove only isolated fixture");
    }
    #[test]
    fn durable_branch_rejects_existing_orphaned_database() {
        let dir=env::temp_dir().join(format!("foon-w05-orphan-unit-{}",Uuid::new_v4().simple()));
        fs::create_dir(&dir).expect("isolated temporary fixture");
        fs::write(dir.join("orders.sqlite"),b"fixture").expect("fixture data");
        assert_eq!(load_or_create_branch(&dir).unwrap_err(),
            "DURABLE_BRANCH_MISSING_FOR_EXISTING_DB");
        fs::remove_dir_all(&dir).expect("remove only isolated fixture");
    }
    #[test]
    fn os_lock_blocks_concurrent_durable_sqlite_owner() {
        let dir=env::temp_dir().join(format!("foon-w05-lock-unit-{}",Uuid::new_v4().simple()));
        fs::create_dir(&dir).expect("isolated temporary fixture");
        let lock=dir.join("w05.lock");
        let first=OpenOptions::new().create(true).read(true).write(true).open(&lock).unwrap();
        first.try_lock_exclusive().expect("first owner");
        let second=OpenOptions::new().create(true).read(true).write(true).open(&lock).unwrap();
        assert!(second.try_lock_exclusive().is_err(),"second owner must not start");
        drop(first);drop(second);
        fs::remove_dir_all(&dir).expect("remove only isolated fixture");
    }
    #[test]
    fn generated_secrets_are_long_and_independent() {
        let a=secret();let b=secret();
        assert_eq!(a.len(),128);
        assert_ne!(a,b);
        assert!(a.bytes().all(|x|x.is_ascii_hexdigit()));
    }
}
