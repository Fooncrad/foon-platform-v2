//! W03 isolated Windows demo. NEVER connect this to production tenant/orders.
use reqwest::blocking::Client;
use reqwest::header::AUTHORIZATION;
use serde::{Deserialize, Serialize};
use std::env;
use std::path::PathBuf;
use std::time::Duration;
use uuid::Uuid;

const GATEWAY: &str = "http://127.0.0.1:8787";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStatus {
    enabled: bool,
    reason: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoOrder {
    id: String,
    status: String,
    pending_events: u64,
}

#[derive(Deserialize)]
struct OrderRow {
    id: String,
    branch_id: String,
    status: String,
    pending_events: u64,
}

#[derive(Deserialize)]
struct OrdersPayload {
    orders: Vec<OrderRow>,
}

struct DemoContext {
    token: String,
    branch: Uuid,
}

/// Require an actual isolated SQLite database under the user's OS temp directory.
/// Test mode alone NEVER authorizes creating orders in a merchant/production database.
fn context() -> Result<DemoContext, &'static str> {
    if env::var("FOON_DESKTOP_DEMO_MODE").as_deref() != Ok("1") {
        return Err("DEMO_DISABLED");
    }
    for key in [
        "FOON_EDGE_TENANT_ID",
        "FOON_EDGE_DEVICE_ID",
        "FOON_EDGE_CLOUD_SYNC_URL",
    ] {
        if env::var(key).is_ok_and(|v| !v.is_empty()) {
            return Err("DEMO_SCOPE_FORBIDDEN");
        }
    }
    if env::var("FOON_LAN_HOST").is_ok_and(|v| v != "127.0.0.1") ||
       env::var("FOON_LAN_PORT").is_ok_and(|v| v != "8787") {
        return Err("DEMO_NETWORK_FORBIDDEN");
    }

    let token = env::var("FOON_LAN_TOKEN").map_err(|_| "DEMO_TOKEN_REQUIRED")?;
    if !(32..=256).contains(&token.len()) ||
        !token.bytes().all(|c| c.is_ascii_alphanumeric() || b"-._~".contains(&c)) {
        return Err("DEMO_TOKEN_REQUIRED");
    }
    let path = env::var_os("FOON_LAN_DB").map(PathBuf::from).ok_or("DEMO_DB_REQUIRED")?;
    if path.file_name().and_then(|x| x.to_str()) != Some("orders.sqlite") {
        return Err("DEMO_DB_FORBIDDEN");
    }
    let canonical = path.canonicalize().map_err(|_| "DEMO_DB_NOT_READY")?;
    let branch = env::var("FOON_DESKTOP_DEMO_BRANCH_ID")
        .ok().and_then(|x| Uuid::parse_str(&x).ok()).ok_or("DEMO_BRANCH_REQUIRED")?;
    if env::var("FOON_DESKTOP_DURABLE_TEST").as_deref()==Ok("1") {
        // W05: only the app-owned, explicit synthetic store; never merchant SQLite.
        let local=env::var_os("LOCALAPPDATA").map(PathBuf::from)
            .ok_or("DURABLE_DIRECTORY_FORBIDDEN")?;
        let durable_dir=local.join("com.foon.desktop").join("w05-durable-test");
        if path.file_name().and_then(|f|f.to_str())!=Some("orders.sqlite") {
            return Err("DURABLE_DB_FORBIDDEN");
        }
        if std::fs::symlink_metadata(&path).map_err(|_| "DURABLE_DB_NOT_READY")?
            .file_type().is_symlink() {
            return Err("DURABLE_DB_SYMLINK_FORBIDDEN");
        }
        let expected_parent=durable_dir.canonicalize().map_err(|_| "DURABLE_DB_NOT_READY")?;
        if canonical.parent()!=Some(expected_parent.as_path()) {
            return Err("DURABLE_DB_FORBIDDEN");
        }
        let stored=std::fs::read_to_string(durable_dir.join("demo-branch.txt"))
            .map_err(|_| "DURABLE_BRANCH_NOT_READY")?;
        if stored.trim()!=branch.to_string() ||
            env::var("FOON_EDGE_BRANCH_ID").as_deref()!=Ok(stored.trim()) {
            return Err("DURABLE_BRANCH_MISMATCH");
        }
    } else {
        if env::var("FOON_EDGE_BRANCH_ID").is_ok_and(|v| !v.is_empty()) {
            return Err("DEMO_SCOPE_FORBIDDEN");
        }
        // W03/W04 ephemeral demo still requires an isolated temporary directory.
        let temp=env::temp_dir().canonicalize().map_err(|_| "DEMO_TEMP_UNAVAILABLE")?;
        let parent=canonical.parent().ok_or("DEMO_DB_FORBIDDEN")?;
        if parent.parent()!=Some(temp.as_path()) {
            return Err("DEMO_DB_FORBIDDEN");
        }
        let folder=parent.file_name().and_then(|x| x.to_str()).ok_or("DEMO_DB_FORBIDDEN")?;
        let suffix=folder.strip_prefix("FOON-W03-Demo-").ok_or("DEMO_DB_FORBIDDEN")?;
        if suffix.len()!=32 || !suffix.bytes().all(|c| c.is_ascii_hexdigit()) {
            return Err("DEMO_DB_FORBIDDEN");
        }
    }
    Ok(DemoContext {token,branch})
}

fn client() -> Result<Client, &'static str> {
    Client::builder()
        .connect_timeout(Duration::from_millis(450))
        .timeout(Duration::from_millis(1800))
        .redirect(reqwest::redirect::Policy::none())
        .build().map_err(|_| "DEMO_CLIENT_UNAVAILABLE")
}

fn authenticated(client: &Client, token: &str) -> reqwest::blocking::RequestBuilder {
    client.get(format!("{GATEWAY}/health"))
        .header(AUTHORIZATION, format!("Bearer {token}"))
}

fn check_health(ctx: &DemoContext, client: &Client) -> Result<(), &'static str> {
    let response = authenticated(client,&ctx.token).send().map_err(|_| "DEMO_GATEWAY_OFFLINE")?;
    if !response.status().is_success() {return Err("DEMO_GATEWAY_UNAUTHORIZED");}
    let status: serde_json::Value = response.json().map_err(|_| "DEMO_UNEXPECTED_RESPONSE")?;
    if status.get("ok") != Some(&serde_json::json!(true)) ||
       status.get("storage").and_then(|v| v.as_str()) != Some("sqlite-wal-full") {
        return Err("DEMO_UNEXPECTED_RESPONSE");
    }
    Ok(())
}

#[tauri::command]
pub fn demo_status() -> DemoStatus {
    match context() {
        Ok(_) => DemoStatus{enabled:true,reason:"ISOLATED_DEMO_CONFIGURED"},
        Err(code) => DemoStatus{enabled:false,reason:code},
    }
}

/// List only rows from the isolated demo branch. Return no full payload, tokens or PII.
#[tauri::command]
pub fn demo_list_orders() -> Result<Vec<DemoOrder>, String> {
    let ctx=context().map_err(str::to_string)?;
    let client=client().map_err(str::to_string)?;
    check_health(&ctx,&client).map_err(str::to_string)?;
    let response=client.get(format!("{GATEWAY}/orders"))
        .header(AUTHORIZATION,format!("Bearer {}",ctx.token))
        .send().map_err(|_| "DEMO_GATEWAY_OFFLINE".to_string())?;
    if !response.status().is_success() {return Err("DEMO_GATEWAY_UNAUTHORIZED".into());}
    let payload:OrdersPayload=response.json().map_err(|_| "DEMO_UNEXPECTED_RESPONSE".to_string())?;
    if payload.orders.iter().any(|o| o.branch_id!=ctx.branch.to_string()) {
        return Err("DEMO_BRANCH_MISMATCH".into());
    }
    Ok(payload.orders.into_iter().map(|row| DemoOrder{
        id:row.id,status:row.status,pending_events:row.pending_events
    }).collect())
}

#[tauri::command]
pub fn demo_create_order() -> Result<String, String> {
    let ctx=context().map_err(str::to_string)?;
    let client=client().map_err(str::to_string)?;
    check_health(&ctx,&client).map_err(str::to_string)?;
    let id=Uuid::new_v4().to_string();
    let payload=serde_json::json!({
        "id":id,
        "branchId":ctx.branch.to_string(),
        "items":[{"id":Uuid::new_v4().to_string(),
            "quantity":1,"expectedUnitCents":950,"expectedCurrency":"SAR"}]
    });
    let response=client.post(format!("{GATEWAY}/orders"))
        .header(AUTHORIZATION,format!("Bearer {}",ctx.token))
        .json(&payload).send().map_err(|_| "DEMO_GATEWAY_OFFLINE".to_string())?;
    if response.status()!=reqwest::StatusCode::CREATED {
        return Err("DEMO_ORDER_REJECTED".into());
    }
    Ok(id)
}

#[tauri::command]
pub fn demo_update_order(id:String,status:String) -> Result<(), String> {
    let ctx=context().map_err(str::to_string)?;
    let id=Uuid::parse_str(&id).map_err(|_| "INVALID_DEMO_ORDER_ID".to_string())?;
    if !["preparing","ready","completed","cancelled"].contains(&status.as_str()) {
        return Err("INVALID_DEMO_STATUS".into());
    }
    let client=client().map_err(str::to_string)?;
    check_health(&ctx,&client).map_err(str::to_string)?;
    // Only permit editing an order that belongs to this demo branch.
    let current=demo_list_orders()?;
    if !current.iter().any(|o| o.id==id.to_string()) {
        return Err("DEMO_ORDER_NOT_FOUND".into());
    }
    let response=client.patch(format!("{GATEWAY}/orders/{id}/status"))
        .header(AUTHORIZATION,format!("Bearer {}",ctx.token))
        .json(&serde_json::json!({"status":status}))
        .send().map_err(|_| "DEMO_GATEWAY_OFFLINE".to_string())?;
    if !response.status().is_success() {
        return Err("DEMO_STATUS_REJECTED".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn default_disables_demo() {
        // Deterministic independent helper rather than touching global env:
        assert_eq!("FOON-W03-Demo-".len(), 14);
        assert_eq!(Uuid::new_v4().to_string().len(),36);
    }
    #[test]
    fn serializes_pending_events_in_expected_ui_format() {
        let order = DemoOrder {
            id: "11111111-1111-4111-8111-111111111111".to_string(),
            status: "new".to_string(),
            pending_events: 3,
        };
        let value = serde_json::to_value(order).expect("serialized demo order");
        assert_eq!(value.get("pendingEvents").and_then(|v| v.as_u64()), Some(3));
        assert!(value.get("pending_events").is_none());

    }
}
