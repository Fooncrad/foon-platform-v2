//! W24: first native Windows SQLite transaction that atomically saves
//! an order + created event + pending outbox record.
//! Not exposed via Tauri, HTTP or the WebView.
//! This initial module ONLY opens a newly created synthetic Temp fixture:
//! it CANNOT point at W05/W06 or any live merchant database.
//! The later real native POS needs device enrollment, scope controls,
//! schema migration and recovery tests before widening this path.
#![cfg(windows)]
#![allow(dead_code)]

use std::ffi::{c_char, c_int, c_void, CString};
use std::fs;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use serde_json::Value;
use crate::native_event_digest::{digest_trusted_event, TrustedRawEvent};

const OK: c_int=0;
const ROW: c_int=100;
const DONE: c_int=101;
const SQLITE_OPEN_READWRITE:c_int=0x00000002;
const SQLITE_OPEN_FULLMUTEX:c_int=0x00010000;
const MAX_EVENT_BYTES:usize=16_384;
const PREFIX:&str="FOON-W24-Fixture-";
const DB_NAME:&str="orders.sqlite";
const MAX_JS_SAFE:i64=9_007_199_254_740_991;

#[link(name="winsqlite3")]
extern "C" {
    fn sqlite3_open_v2(name:*const c_char,db:*mut *mut c_void,flags:c_int,vfs:*const c_char)->c_int;
    fn sqlite3_close_v2(db:*mut c_void)->c_int;
    fn sqlite3_exec(db:*mut c_void,sql:*const c_char,
        callback:Option<unsafe extern "C" fn(*mut c_void,c_int,*mut *mut c_char,*mut *mut c_char)->c_int>,
        arg:*mut c_void,errmsg:*mut *mut c_char)->c_int;
    fn sqlite3_prepare_v2(db:*mut c_void,sql:*const c_char,size:c_int,stmt:*mut *mut c_void,tail:*mut *const c_char)->c_int;
    fn sqlite3_finalize(stmt:*mut c_void)->c_int;
    fn sqlite3_step(stmt:*mut c_void)->c_int;
    fn sqlite3_reset(stmt:*mut c_void)->c_int;
    fn sqlite3_bind_text(stmt:*mut c_void,index:c_int,value:*const c_char,len:c_int,destructor:Option<unsafe extern "C" fn(*mut c_void)>)->c_int;
    fn sqlite3_bind_int64(stmt:*mut c_void,index:c_int,value:i64)->c_int;
    fn sqlite3_last_insert_rowid(db:*mut c_void)->i64;
    fn sqlite3_changes(db:*mut c_void)->c_int;
}
struct Database(*mut c_void);
impl Drop for Database {
    fn drop(&mut self) { if !self.0.is_null() {unsafe{let _=sqlite3_close_v2(self.0);}} }
}
struct Statement(*mut c_void);
impl Drop for Statement {
    fn drop(&mut self) { if !self.0.is_null(){unsafe{let _=sqlite3_finalize(self.0);}} }
}
struct Transaction(*mut c_void,bool);
impl Drop for Transaction {
    fn drop(&mut self) {if !self.1 {let _=exec_sql(self.0,b"ROLLBACK\0");}}
}
fn exec_sql(db:*mut c_void,sql:&[u8])->Result<(),&'static str> {
    let result=unsafe{sqlite3_exec(db,sql.as_ptr() as *const c_char,None,null_mut(),null_mut())};
    if result!=OK {Err("W24_SQLITE_TRANSACTION_FAILED")}else{Ok(())}
}
fn prepared(db:*mut c_void,sql:&[u8])->Result<Statement,&'static str> {
    let mut stmt=Statement(null_mut());
    let result=unsafe{sqlite3_prepare_v2(db,sql.as_ptr() as *const c_char,-1,&mut stmt.0,null_mut())};
    if result!=OK||stmt.0.is_null(){return Err("W24_UNEXPECTED_FIXTURE_SCHEMA");}
    Ok(stmt)
}
fn bind_text(stmt:*mut c_void,index:i32,text:&str)->Result<(),&'static str> {
    // With a temporary CString, the bound argument must be copied before
    // the CString is dropped. SQLITE_TRANSIENT is (sqlite3_destructor_type)-1.
    let value=CString::new(text).map_err(|_|"W24_INPUT_CONTAINS_NUL")?;
    // SQLite pointer -1 is the documented SQLITE_TRANSIENT callback marker.
    let transient:unsafe extern "C" fn(*mut c_void)=unsafe{std::mem::transmute::<isize,_>(-1)};
    let result=unsafe{sqlite3_bind_text(stmt,index,value.as_ptr(),-1,Some(transient))};
    if result!=OK {Err("W24_SQLITE_BIND_FAILED")}else{Ok(())}
}
fn bind_i64(stmt:*mut c_void,index:i32,value:i64)->Result<(),&'static str>{
    if unsafe{sqlite3_bind_int64(stmt,index,value)}!=OK{
        Err("W24_SQLITE_BIND_FAILED")
    }else{Ok(())}
}
fn valid_id(v:&str,max:usize)->bool {
    !v.is_empty()&&v.len()<=max&&v.is_ascii()&&v.bytes().all(|c|c>=0x20&&c<0x7f)
}
fn path_for_synthetic_only(path:&Path)->Result<PathBuf,&'static str>{
    if !path.is_absolute()||path.file_name().and_then(|s|s.to_str())!=Some(DB_NAME){
        return Err("W24_SYNTHETIC_DB_REQUIRED");
    }
    let folder=path.parent().ok_or("W24_SYNTHETIC_DB_REQUIRED")?;
    let folder_name=folder.file_name().and_then(|s|s.to_str()).ok_or("W24_SYNTHETIC_DB_REQUIRED")?;
    let token=folder_name.strip_prefix(PREFIX).ok_or("W24_SYNTHETIC_DB_REQUIRED")?;
    if token.len()!=32||!token.bytes().all(|b|b.is_ascii_hexdigit()){
        return Err("W24_SYNTHETIC_DB_REQUIRED");
    }
    let root=fs::canonicalize(std::env::temp_dir()).map_err(|_|"W24_OS_TEMP_REQUIRED")?;
    let dir=fs::canonicalize(folder).map_err(|_|"W24_SYNTHETIC_DB_REQUIRED")?;
    if dir.parent()!=Some(root.as_path()){return Err("W24_SYNTHETIC_DB_REQUIRED");}
    let entry=fs::symlink_metadata(path).map_err(|_|"W24_SYNTHETIC_DB_REQUIRED")?;
    if !entry.is_file()||entry.file_type().is_symlink()||entry.len()==0||entry.len()>1024*1024 {
        return Err("W24_SYNTHETIC_DB_REQUIRED");
    }
    let real=fs::canonicalize(path).map_err(|_|"W24_SYNTHETIC_DB_REQUIRED")?;
    if real.parent()!=Some(dir.as_path()){return Err("W24_SYNTHETIC_DB_REQUIRED");}
    Ok(real)
}

pub(crate) struct TrustedOrder<'a>{
    pub(crate) id:&'a str,
    pub(crate) tenant_id:&'a str,
    pub(crate) branch_id:&'a str,
    pub(crate) device_id:&'a str,
    pub(crate) created_at:&'a str,
    // Canonical JSON already serialized by a trusted local validator.
    pub(crate) payload_json:&'a str
}
#[derive(Debug,PartialEq,Eq)]
pub(crate) struct CreatedOrder {
    pub(crate) event_seq:u64,
    pub(crate) outbox_seq:u64,
    pub(crate) digest_hex:String
}
#[derive(Clone,Copy)]
pub(crate) enum FaultPoint {None,AfterCatalog,AfterOrder,AfterEvent,AfterOutbox}
fn validate(event:&TrustedOrder<'_>)->Result<(),&'static str>{
    if !valid_id(event.id,128)||!valid_id(event.tenant_id,128)||
       !valid_id(event.branch_id,128)||!valid_id(event.device_id,128)||
       event.created_at.len()!=24||!event.created_at.ends_with('Z')||
       event.payload_json.len()>MAX_EVENT_BYTES||
       !event.payload_json.starts_with('{')||!event.payload_json.ends_with('}') {
       return Err("W24_INVALID_TRUSTED_ORDER");
    }
    let payload:Value=serde_json::from_str(event.payload_json)
        .map_err(|_|"W24_INVALID_TRUSTED_PAYLOAD")?;
    let obj=payload.as_object().ok_or("W24_INVALID_TRUSTED_PAYLOAD")?;
    if obj.get("id").and_then(Value::as_str)!=Some(event.id)||
       obj.get("branchId").and_then(Value::as_str)!=Some(event.branch_id)||
       obj.get("status").and_then(Value::as_str)!=Some("new")||
       obj.get("createdAt").and_then(Value::as_str)!=Some(event.created_at)||
       !obj.get("items").and_then(Value::as_array).is_some_and(|v|!v.is_empty()&&v.len()<=100) {
        return Err("W24_INVALID_TRUSTED_PAYLOAD");
    }
    Ok(())
}
fn hex(bytes:&[u8])->String{bytes.iter().map(|b|format!("{b:02x}")).collect()}

// W25 has a separate opt-in path using ONLY a synthetic scoped local catalog.
// SQL inside the SAME BEGIN IMMEDIATE as the order and Outbox commits.
// This is not a substitute for a central signed catalog or real permissions.
const RESERVE_CATALOG:&[u8]=b"UPDATE synthetic_catalog SET stock_qty=stock_qty-? WHERE tenant_id=? AND branch_id=? AND item_id=? AND stock_qty>=? AND unit_cents=? AND currency=? AND enabled=1\0";
fn reserve_synthetic_catalog(
    db:*mut c_void,
    order:&TrustedOrder<'_>
)->Result<(),&'static str>{
    let payload:Value=serde_json::from_str(order.payload_json)
        .map_err(|_|"W25_INVALID_ITEMS")?;
    let items=payload.get("items").and_then(Value::as_array)
        .ok_or("W25_INVALID_ITEMS")?;
    if items.is_empty()||items.len()>100{return Err("W25_INVALID_ITEMS");}
    let mut seen=HashSet::new();
    for item in items {
        let obj=item.as_object().ok_or("W25_INVALID_ITEMS")?;
        if obj.len()!=4||!["id","quantity","expectedUnitCents","expectedCurrency"]
            .iter().all(|key|obj.contains_key(*key)){
            return Err("W25_INVALID_ITEMS");
        }
        let item_id=obj.get("id").and_then(Value::as_str)
            .ok_or("W25_INVALID_ITEMS")?;
        let qty=obj.get("quantity").and_then(Value::as_u64)
            .ok_or("W25_INVALID_ITEMS")?;
        let cents=obj.get("expectedUnitCents").and_then(Value::as_u64)
            .ok_or("W25_INVALID_ITEMS")?;
        let currency=obj.get("expectedCurrency").and_then(Value::as_str)
            .ok_or("W25_INVALID_ITEMS")?;
        if !valid_id(item_id,128)||!seen.insert(item_id)||
           !(1..=1000).contains(&qty)||cents>1_000_000_000||
           currency.len()!=3||!currency.bytes().all(|b|b.is_ascii_uppercase()){
           return Err("W25_INVALID_ITEMS");
        }
        let stmt=prepared(db,RESERVE_CATALOG)?;
        bind_i64(stmt.0,1,qty as i64)?;
        bind_text(stmt.0,2,order.tenant_id)?;
        bind_text(stmt.0,3,order.branch_id)?;
        bind_text(stmt.0,4,item_id)?;
        bind_i64(stmt.0,5,qty as i64)?;
        bind_i64(stmt.0,6,cents as i64)?;
        bind_text(stmt.0,7,currency)?;
        if unsafe{sqlite3_step(stmt.0)}!=DONE||unsafe{sqlite3_changes(db)}!=1{
            return Err("W25_CATALOG_PRICE_STOCK_OR_ITEM_UNAVAILABLE");
        }
    }
    Ok(())
}

const SCOPE:&[u8]=b"SELECT 1 FROM scope_lock WHERE tenant_id=? AND branch_id=? AND device_id=? AND enabled=1 LIMIT 1\0";
const EXISTS:&[u8]=b"SELECT 1 FROM orders WHERE id=? LIMIT 1\0";
const INSERT_ORDER:&[u8]=b"INSERT INTO orders(id,branch_id,payload,status,created_at,updated_at) VALUES(?,?,?,'new',?,?)\0";
const INSERT_EVENT:&[u8]=b"INSERT INTO events(order_id,kind,payload,created_at,device_id) VALUES(?,'created',?,?,?)\0";
const INSERT_OUTBOX:&[u8]=b"INSERT INTO outbox(event_seq,synced_at) VALUES(?,NULL)\0";

pub(crate) fn create_synthetic_order_atomic(
    db_file:&Path,
    order:TrustedOrder<'_>,
    injected_failure:FaultPoint
)->Result<CreatedOrder,&'static str>{
    create_order_inner(db_file,order,injected_failure,false)
}
pub(crate) fn create_synthetic_order_with_catalog_atomic(
    db_file:&Path,
    order:TrustedOrder<'_>,
    injected_failure:FaultPoint
)->Result<CreatedOrder,&'static str>{
    create_order_inner(db_file,order,injected_failure,true)
}
fn create_order_inner(
    db_file:&Path,
    order:TrustedOrder<'_>,
    injected_failure:FaultPoint,
    enforce_catalog:bool
)->Result<CreatedOrder,&'static str>{
    validate(&order)?;
    let path=path_for_synthetic_only(db_file)?;
    let file=CString::new(path.to_str().ok_or("W24_SYNTHETIC_DB_REQUIRED")?)
        .map_err(|_|"W24_SYNTHETIC_DB_REQUIRED")?;
    let mut db=Database(null_mut());
    let open=unsafe{sqlite3_open_v2(file.as_ptr(),&mut db.0,
        SQLITE_OPEN_READWRITE|SQLITE_OPEN_FULLMUTEX,null())};
    if open!=OK||db.0.is_null(){return Err("W24_SQLITE_OPEN_FAILED");}
    // Every connection enforces foreign keys and durable WAL commits.
    // A configuration in the creating Node connection is NOT inherited.
    exec_sql(db.0,b"PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;\0")?;
    exec_sql(db.0,b"BEGIN IMMEDIATE\0")?;
    let mut tx=Transaction(db.0,false);
    {
        let stmt=prepared(db.0,SCOPE)?;
        bind_text(stmt.0,1,order.tenant_id)?;
        bind_text(stmt.0,2,order.branch_id)?;
        bind_text(stmt.0,3,order.device_id)?;
        if unsafe{sqlite3_step(stmt.0)}!=ROW {return Err("W24_SCOPE_FORBIDDEN");}
    }
    {
        let stmt=prepared(db.0,EXISTS)?;
        bind_text(stmt.0,1,order.id)?;
        match unsafe{sqlite3_step(stmt.0)}{
            ROW=>return Err("W24_ORDER_ID_ALREADY_EXISTS"),
            DONE=>{},
            _=>return Err("W24_ORDER_LOOKUP_FAILED")
        }
    }
    // Both catalog stock and order/event/outbox mutation share the SAME
    // transaction, so validation and stock reservation cannot race.
    if enforce_catalog {
        reserve_synthetic_catalog(db.0,&order)?;
        if matches!(injected_failure,FaultPoint::AfterCatalog) {
            return Err("W24_SYNTHETIC_INJECTED_ROLLBACK");
        }
    }
    {
        let stmt=prepared(db.0,INSERT_ORDER)?;
        bind_text(stmt.0,1,order.id)?;
        bind_text(stmt.0,2,order.branch_id)?;
        bind_text(stmt.0,3,order.payload_json)?;
        bind_text(stmt.0,4,order.created_at)?;
        bind_text(stmt.0,5,order.created_at)?;
        if unsafe{sqlite3_step(stmt.0)}!=DONE||unsafe{sqlite3_changes(db.0)}!=1{
            return Err("W24_ORDER_INSERT_FAILED");
        }
    }
    if matches!(injected_failure,FaultPoint::AfterOrder){
        return Err("W24_SYNTHETIC_INJECTED_ROLLBACK");
    }
    let seq={
        let stmt=prepared(db.0,INSERT_EVENT)?;
        bind_text(stmt.0,1,order.id)?;
        bind_text(stmt.0,2,order.payload_json)?;
        bind_text(stmt.0,3,order.created_at)?;
        bind_text(stmt.0,4,order.device_id)?;
        if unsafe{sqlite3_step(stmt.0)}!=DONE||unsafe{sqlite3_changes(db.0)}!=1{
            return Err("W24_EVENT_INSERT_FAILED");
        }
        let id=unsafe{sqlite3_last_insert_rowid(db.0)};
        if id<=0||id>MAX_JS_SAFE{return Err("W24_EVENT_SEQ_INVALID");}
        id as u64
    };
    if matches!(injected_failure,FaultPoint::AfterEvent){
        return Err("W24_SYNTHETIC_INJECTED_ROLLBACK");
    }
    let outbox_id={
        let stmt=prepared(db.0,INSERT_OUTBOX)?;
        bind_i64(stmt.0,1,seq as i64)?;
        if unsafe{sqlite3_step(stmt.0)}!=DONE||unsafe{sqlite3_changes(db.0)}!=1{
            return Err("W24_OUTBOX_INSERT_FAILED");
        }
        let id=unsafe{sqlite3_last_insert_rowid(db.0)};
        if id<=0||id>MAX_JS_SAFE{return Err("W24_OUTBOX_SEQ_INVALID");}
        id as u64
    };
    if matches!(injected_failure,FaultPoint::AfterOutbox){
        return Err("W24_SYNTHETIC_INJECTED_ROLLBACK");
    }
    let digest=digest_trusted_event(TrustedRawEvent{
        seq,order_id:order.id,kind:"created",payload_json:order.payload_json
    }).map_err(|_|"W24_EVENT_DIGEST_INVALID")?;
    exec_sql(db.0,b"COMMIT\0")?;
    tx.1=true;
    Ok(CreatedOrder{event_seq:seq,outbox_seq:outbox_id,digest_hex:hex(&digest)})
}

#[cfg(test)]
mod tests {
    use super::*;
    const PAYLOAD:&str=r#"{"id":"order-fixture-w24","branchId":"branch-fixture-w24","items":[{"id":"item-A","quantity":2,"expectedUnitCents":950,"expectedCurrency":"SAR"}],"status":"new","createdAt":"2026-10-19T00:00:00.000Z"}"#;
    fn fixture<'a>() -> TrustedOrder<'a> {
        TrustedOrder{
            id:"order-fixture-w24",tenant_id:"tenant-fixture-w24",
            branch_id:"branch-fixture-w24",device_id:"device-fixture-w24",
            created_at:"2026-10-19T00:00:00.000Z",payload_json:PAYLOAD
        }
    }
    #[test]
    fn refuses_non_temporary_merchant_database(){
        for input in [
            r"C:\Users\merchant\AppData\Local\FOON\orders.sqlite",
            r"C:\Users\merchant\Desktop\orders.sqlite",
            "orders.sqlite"
        ]{
            assert!(path_for_synthetic_only(Path::new(input)).is_err());
        }
    }
    #[test]
    fn invalid_payload_and_wrong_branch_are_rejected_before_database_open(){
        let mut changed=fixture();
        changed.branch_id="branch-other";
        assert!(matches!(validate(&changed),Err("W24_INVALID_TRUSTED_PAYLOAD")));
        let mut changed=fixture();
        changed.payload_json=r#"{"id":"order-fixture-w24"}"#;
        assert!(matches!(validate(&changed),Err("W24_INVALID_TRUSTED_PAYLOAD")));
    }
    #[test]
    fn w25_rejects_invalid_scoped_catalog_payload_without_database_mutation(){
        let mut order=fixture();
        order.payload_json=r#"{"id":"order-fixture-w24","branchId":"branch-fixture-w24","items":[{"id":"item-A","quantity":0,"expectedUnitCents":950,"expectedCurrency":"SAR"}],"status":"new","createdAt":"2026-10-19T00:00:00.000Z"}"#;
        // The original W24 trusted caller path only checks payload shape;
        // the W25 catalog writer performs stronger per-item validation.
        assert!(validate(&order).is_ok());
        assert!(matches!(create_synthetic_order_with_catalog_atomic(
            Path::new("orders.sqlite"),order,FaultPoint::None
        ),Err("W24_SYNTHETIC_DB_REQUIRED")));
    }
    #[test]
    #[ignore="W25 requires a newly created synthetic Temp scoped catalog"]
    fn w25_native_catalog_order_case(){
        let path=std::env::var_os("FOON_W25_TEST_DB_PATH")
            .expect("W25_TEMP_DB_REQUIRED");
        let case=std::env::var("FOON_W25_TEST_CASE")
            .expect("W25_TEST_CASE_REQUIRED");
        let mut order=fixture();
        const PRICE_CHANGED:&str=r#"{"id":"order-fixture-w24","branchId":"branch-fixture-w24","items":[{"id":"item-A","quantity":2,"expectedUnitCents":951,"expectedCurrency":"SAR"}],"status":"new","createdAt":"2026-10-19T00:00:00.000Z"}"#;
        const BAD_QUANTITY:&str=r#"{"id":"order-fixture-w24","branchId":"branch-fixture-w24","items":[{"id":"item-A","quantity":0,"expectedUnitCents":950,"expectedCurrency":"SAR"}],"status":"new","createdAt":"2026-10-19T00:00:00.000Z"}"#;
        const DUPLICATE:&str=r#"{"id":"order-fixture-w24","branchId":"branch-fixture-w24","items":[{"id":"item-A","quantity":2,"expectedUnitCents":950,"expectedCurrency":"SAR"},{"id":"item-A","quantity":1,"expectedUnitCents":950,"expectedCurrency":"SAR"}],"status":"new","createdAt":"2026-10-19T00:00:00.000Z"}"#;
        const MIXED:&str=r#"{"id":"order-fixture-w24","branchId":"branch-fixture-w24","items":[{"id":"item-A","quantity":2,"expectedUnitCents":950,"expectedCurrency":"SAR"},{"id":"item-MISSING","quantity":1,"expectedUnitCents":500,"expectedCurrency":"SAR"}],"status":"new","createdAt":"2026-10-19T00:00:00.000Z"}"#;
        const EXTRA:&str=r#"{"id":"order-fixture-w24","branchId":"branch-fixture-w24","items":[{"id":"item-A","quantity":2,"expectedUnitCents":950,"expectedCurrency":"SAR","printer":"untrusted"}],"status":"new","createdAt":"2026-10-19T00:00:00.000Z"}"#;
        const WRONG_CURRENCY:&str=r#"{"id":"order-fixture-w24","branchId":"branch-fixture-w24","items":[{"id":"item-A","quantity":2,"expectedUnitCents":950,"expectedCurrency":"USD"}],"status":"new","createdAt":"2026-10-19T00:00:00.000Z"}"#;
        if case=="price-changed"{order.payload_json=PRICE_CHANGED;}
        if case=="bad-quantity"{order.payload_json=BAD_QUANTITY;}
        if case=="duplicate-item"{order.payload_json=DUPLICATE;}
        if case=="mixed-rollback"{order.payload_json=MIXED;}
        if case=="extra-field"{order.payload_json=EXTRA;}
        if case=="wrong-currency"{order.payload_json=WRONG_CURRENCY;}
        if case=="wrong-tenant"{order.tenant_id="other-tenant";}
        if case=="wrong-device"{order.device_id="other-device";}
        let fault=if case=="after-catalog"{FaultPoint::AfterCatalog}else{FaultPoint::None};
        let result=create_synthetic_order_with_catalog_atomic(Path::new(&path),order,fault);
        match case.as_str(){
            "success"=>{
                let made=result.expect("W25_VALID_ORDER_MUST_PERSIST_ATOMICALLY");
                assert_eq!(made.event_seq,1);
                assert_eq!(made.outbox_seq,1);
                assert_eq!(made.digest_hex.len(),64);
                assert!(matches!(create_synthetic_order_with_catalog_atomic(
                    Path::new(&path),fixture(),FaultPoint::None
                ),Err("W24_ORDER_ID_ALREADY_EXISTS")));
            },
            "after-catalog"=>assert!(matches!(result,Err("W24_SYNTHETIC_INJECTED_ROLLBACK"))),
            "price-changed"|"missing-item"|"disabled-item"|"insufficient-stock"|
            "wrong-currency"|"mixed-rollback"=>
                assert!(matches!(result,Err("W25_CATALOG_PRICE_STOCK_OR_ITEM_UNAVAILABLE"))),
            "bad-quantity"|"duplicate-item"|"extra-field"=>
                assert!(matches!(result,Err("W25_INVALID_ITEMS"))),
            "wrong-tenant"|"wrong-device"=>
                assert!(matches!(result,Err("W24_SCOPE_FORBIDDEN"))),
            _=>panic!("W25_UNKNOWN_SYNTHETIC_CASE")
        }
    }

    #[test]
    #[ignore="W24 requires a newly created synthetic Temp SQLite fixture"]
    fn atomic_native_order_outbox_case(){
        let path=std::env::var_os("FOON_W24_TEST_DB_PATH")
            .expect("W24_SYNTHETIC_DB_PATH_REQUIRED");
        let scenario=std::env::var("FOON_W24_TEST_CASE")
            .expect("W24_SYNTHETIC_CASE_REQUIRED");
        let mut order=fixture();
        if scenario=="wrong-tenant"{order.tenant_id="other-tenant";}
        if scenario=="wrong-branch"{
            order.branch_id="branch-other";
            // Same changes to the payload so local payload validation passes,
            // but the database's scope_lock still fails authoritatively.
            order.payload_json=r#"{"id":"order-fixture-w24","branchId":"branch-other","items":[{"id":"item-A","quantity":2,"expectedUnitCents":950,"expectedCurrency":"SAR"}],"status":"new","createdAt":"2026-10-19T00:00:00.000Z"}"#;
        }
        if scenario=="wrong-device"{order.device_id="other-device";}
        let fault=match scenario.as_str(){
            "after-order"=>FaultPoint::AfterOrder,
            "after-event"=>FaultPoint::AfterEvent,
            "after-outbox"=>FaultPoint::AfterOutbox,
            _=>FaultPoint::None
        };
        let result=create_synthetic_order_atomic(Path::new(&path),order,fault);
        match scenario.as_str(){
            "success"=>{
                let made=result.expect("W24_COMPLETE_TRANSACTION_REQUIRED");
                assert_eq!(made.event_seq,1);
                assert_eq!(made.outbox_seq,1);
                assert_eq!(made.digest_hex.len(),64);
                assert!(matches!(create_synthetic_order_atomic(
                    Path::new(&path),fixture(),FaultPoint::None
                ),Err("W24_ORDER_ID_ALREADY_EXISTS")));
            },
            "after-order"|"after-event"|"after-outbox"=>
                assert!(matches!(result,Err("W24_SYNTHETIC_INJECTED_ROLLBACK"))),
            "wrong-tenant"|"wrong-branch"|"wrong-device"=>
                assert!(matches!(result,Err("W24_SCOPE_FORBIDDEN"))),
            _=>panic!("W24_UNKNOWN_SYNTHETIC_CASE")
        }
    }
}
