//! W22 TEST-ONLY: synthetic, fully scoped signed-ACK SQLite transaction.
//! This module is never compiled into normal Windows/customer releases.
//! No real W05/W06 SQLite, merchant DB, MariaDB, network, print or Tauri API.
#![cfg(all(test, windows))]
#![allow(dead_code)]
use std::ffi::{c_char,c_int,c_uchar,c_void,CString};
use std::fs;
use std::path::{Path,PathBuf};
use std::ptr::{null,null_mut};
use serde::Deserialize;
use crate::native_event_digest::{digest_trusted_event,TrustedRawEvent};
use crate::native_cloud_receipt::ExpectedEvent;
use crate::protected_receipt_path::verify_receipt_with_protected_device_key;
use crate::windows_secret_store::{DeviceSecret,SealedDeviceSecret,seal};

const SQLITE_OK:c_int=0;
const SQLITE_ROW:c_int=100;
const SQLITE_DONE:c_int=101;
const SQLITE_INTEGER:c_int=1;
const SQLITE_TEXT:c_int=3;
const SQLITE_NULL:c_int=5;
const SQLITE_OPEN_READWRITE:c_int=0x00000002;
const SQLITE_OPEN_FULLMUTEX:c_int=0x00010000;
const MAX_PAYLOAD:usize=16384;
const FIXTURE_NAME:&str="ack-fixture.sqlite";
const FIXTURE_DIR_PREFIX:&str="FOON-W22-Fixture-";
const SYNTHETIC_KEY:&[u8]=b"foon-w17-only-synthetic-device-key-123456789012345";

#[link(name="winsqlite3")]
extern "C" {
    fn sqlite3_open_v2(filename:*const c_char,db:*mut *mut c_void,flags:c_int,vfs:*const c_char)->c_int;
    fn sqlite3_close_v2(db:*mut c_void)->c_int;
    fn sqlite3_exec(db:*mut c_void,sql:*const c_char,callback:Option<unsafe extern "C" fn(*mut c_void,c_int,*mut *mut c_char,*mut *mut c_char)->c_int>,arg:*mut c_void,errmsg:*mut *mut c_char)->c_int;
    fn sqlite3_prepare_v2(db:*mut c_void,sql:*const c_char,len:c_int,stmt:*mut *mut c_void,tail:*mut *const c_char)->c_int;
    fn sqlite3_step(stmt:*mut c_void)->c_int;
    fn sqlite3_finalize(stmt:*mut c_void)->c_int;
    fn sqlite3_column_type(stmt:*mut c_void,index:c_int)->c_int;
    fn sqlite3_column_int64(stmt:*mut c_void,index:c_int)->i64;
    fn sqlite3_column_text(stmt:*mut c_void,index:c_int)->*const c_uchar;
    fn sqlite3_column_bytes(stmt:*mut c_void,index:c_int)->c_int;
    fn sqlite3_bind_int64(stmt:*mut c_void,index:c_int,value:i64)->c_int;
    fn sqlite3_bind_text(stmt:*mut c_void,index:c_int,value:*const c_char,length:c_int,destructor:Option<unsafe extern "C" fn(*mut c_void)>)->c_int;
    fn sqlite3_changes(db:*mut c_void)->c_int;
}
struct Db(*mut c_void);
impl Drop for Db {
    fn drop(&mut self){if !self.0.is_null(){unsafe{let _=sqlite3_close_v2(self.0);}}}
}
struct Query(*mut c_void);
impl Drop for Query {
    fn drop(&mut self){if !self.0.is_null(){unsafe{let _=sqlite3_finalize(self.0);}}}
}
fn fixed_sql(db:*mut c_void,sql:&[u8])->Result<(),&'static str>{
    let rc=unsafe{sqlite3_exec(db,sql.as_ptr() as *const c_char,None,null_mut(),null_mut())};
    if rc!=SQLITE_OK{Err("W22_TRANSACTION_SQL_REJECTED")}else{Ok(())}
}
struct Transaction(*mut c_void,bool);
impl Drop for Transaction {
    fn drop(&mut self){
        if !self.1 {let _=fixed_sql(self.0,b"ROLLBACK\0");}
    }
}
fn verify_fixture(path:&Path)->Result<PathBuf,&'static str>{
    if !path.is_absolute()||path.file_name().and_then(|s|s.to_str())!=Some(FIXTURE_NAME){
        return Err("W22_TEMP_PATH_REQUIRED");
    }
    let folder=path.parent().ok_or("W22_TEMP_PATH_FORBIDDEN")?;
    let name=folder.file_name().and_then(|s|s.to_str()).ok_or("W22_TEMP_PATH_FORBIDDEN")?;
    let suffix=name.strip_prefix(FIXTURE_DIR_PREFIX).ok_or("W22_TEMP_PATH_FORBIDDEN")?;
    if suffix.len()!=32||!suffix.bytes().all(|b|b.is_ascii_hexdigit()){
        return Err("W22_TEMP_PATH_FORBIDDEN");
    }
    let root=fs::canonicalize(std::env::temp_dir()).map_err(|_|"W22_TEMP_ROOT_NOT_FOUND")?;
    let parent=fs::canonicalize(folder).map_err(|_|"W22_TEMP_PATH_FORBIDDEN")?;
    if parent.parent()!=Some(root.as_path()){return Err("W22_TEMP_PATH_FORBIDDEN");}
    let meta=fs::symlink_metadata(path).map_err(|_|"W22_TEMP_FILE_REQUIRED")?;
    if !meta.is_file()||meta.file_type().is_symlink()||meta.len()==0||meta.len()>1_048_576{
        return Err("W22_TEMP_FILE_FORBIDDEN");
    }
    let real=fs::canonicalize(path).map_err(|_|"W22_TEMP_PATH_FORBIDDEN")?;
    if real.parent()!=Some(parent.as_path()){return Err("W22_TEMP_PATH_FORBIDDEN");}
    Ok(real)
}
fn identifier(s:&str)->bool{
    !s.is_empty()&&s.len()<=128&&s.is_ascii()&&
      s.bytes().all(|b|b>=0x20&&b<0x7f)
}
unsafe fn read_text(stmt:*mut c_void,i:c_int,max:usize)->Result<String,&'static str>{
    if sqlite3_column_type(stmt,i)!=SQLITE_TEXT{return Err("W22_EVENT_SCHEMA_INVALID");}
    let count=sqlite3_column_bytes(stmt,i);
    if count<1||count as usize>max{return Err("W22_EVENT_TEXT_INVALID");}
    let p=sqlite3_column_text(stmt,i);
    if p.is_null(){return Err("W22_EVENT_TEXT_INVALID");}
    let s=std::str::from_utf8(std::slice::from_raw_parts(p,count as usize))
        .map_err(|_|"W22_EVENT_TEXT_INVALID")?;
    Ok(s.to_owned())
}
fn sha_hex(input:&[u8])->String{input.iter().map(|b|format!("{b:02x}")).collect()}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct ReceiptIdentity{receipt_id:String}
#[derive(Clone,Copy)]
struct TrustedScope<'a>{
    outbox_seq:i64,
    event_seq:u64,
    order_id:&'a str,
    tenant_id:&'a str,
    branch_id:&'a str,
    device_id:&'a str
}
struct Row {
    event_seq:u64,
    order_id:String,kind:String,payload:String,
    tenant_id:String,branch_id:String,device_id:String,
    already_synced:bool
}
const SELECT_ONE:&[u8]=b"SELECT o.event_seq,e.order_id,e.kind,e.payload,e.tenant_id,e.branch_id,e.device_id,o.synced_at FROM outbox o LEFT JOIN events e ON e.seq=o.event_seq WHERE o.seq=?\0";
const UPDATE_ONE:&[u8]=b"UPDATE outbox SET synced_at='W22-SYNTHETIC-ACK',receipt_id=? WHERE seq=? AND event_seq=? AND synced_at IS NULL\0";

fn ack_synthetic_transaction(
    path:&Path,
    scope:TrustedScope<'_>,
    signed_receipt:&[u8],
    protected_key:&SealedDeviceSecret,
    inject_post_update_failure:bool
)->Result<(),&'static str>{
    if scope.outbox_seq<1||scope.event_seq<1||scope.event_seq>9_007_199_254_740_991||
       ![scope.order_id,scope.tenant_id,scope.branch_id,scope.device_id]
         .iter().all(|v|identifier(v)){
        return Err("W22_TRUSTED_SCOPE_INVALID");
    }
    let target=verify_fixture(path)?;
    let filename=CString::new(target.to_str().ok_or("W22_TEMP_PATH_FORBIDDEN")?)
        .map_err(|_|"W22_TEMP_PATH_FORBIDDEN")?;
    let mut db=Db(null_mut());
    let rc=unsafe{sqlite3_open_v2(filename.as_ptr(),&mut db.0,
        SQLITE_OPEN_READWRITE|SQLITE_OPEN_FULLMUTEX,null())};
    if rc!=SQLITE_OK||db.0.is_null(){return Err("W22_TEST_SQLITE_OPEN_REFUSED");}
    fixed_sql(db.0,b"BEGIN IMMEDIATE\0")?;
    let mut transaction=Transaction(db.0,false);
    let row={
        let mut stmt=Query(null_mut());
        let rc=unsafe{sqlite3_prepare_v2(db.0,SELECT_ONE.as_ptr() as *const c_char,-1,
          &mut stmt.0,null_mut())};
        if rc!=SQLITE_OK||stmt.0.is_null(){return Err("W22_TEST_SCHEMA_UNEXPECTED");}
        if unsafe{sqlite3_bind_int64(stmt.0,1,scope.outbox_seq)}!=SQLITE_OK{
            return Err("W22_TEST_BIND_FAILED");
        }
        let rc=unsafe{sqlite3_step(stmt.0)};
        if rc!=SQLITE_ROW{return Err("W22_OUTBOX_MISSING");}
        let event_seq=unsafe {
            if sqlite3_column_type(stmt.0,0)!=SQLITE_INTEGER{
                return Err("W22_EVENT_SCHEMA_INVALID");
            }
            let i=sqlite3_column_int64(stmt.0,0);
            if i<1{return Err("W22_EVENT_SCHEMA_INVALID");}
            i as u64
        };
        let row=unsafe{Row {
            event_seq,
            order_id:read_text(stmt.0,1,128)?,
            kind:read_text(stmt.0,2,16)?,
            payload:read_text(stmt.0,3,MAX_PAYLOAD)?,
            tenant_id:read_text(stmt.0,4,128)?,
            branch_id:read_text(stmt.0,5,128)?,
            device_id:read_text(stmt.0,6,128)?,
            already_synced:sqlite3_column_type(stmt.0,7)!=SQLITE_NULL
        }};
        if unsafe{sqlite3_step(stmt.0)}!=SQLITE_DONE{
            return Err("W22_DUPLICATE_OUTBOX_ROW");
        }
        row
    };
    if row.already_synced{return Err("W22_ALREADY_ACKED");}
    if row.event_seq!=scope.event_seq||row.order_id!=scope.order_id||
      row.tenant_id!=scope.tenant_id||row.branch_id!=scope.branch_id||
      row.device_id!=scope.device_id{
        return Err("W22_SCOPE_OR_EVENT_MISMATCH");
    }
    let calculated=digest_trusted_event(TrustedRawEvent{
        seq:row.event_seq,order_id:&row.order_id,kind:&row.kind,payload_json:&row.payload
    }).map_err(|_|"W22_LOCAL_EVENT_DIGEST_INVALID")?;
    let digest=sha_hex(&calculated);
    if !verify_receipt_with_protected_device_key(
       signed_receipt,
       ExpectedEvent{device_id:scope.device_id,event_seq:row.event_seq,
           order_id:&row.order_id,digest:&digest},protected_key
    ){
        return Err("W22_RECEIPT_SIGNATURE_OR_DIGEST_INVALID");
    }
    let receipt:ReceiptIdentity=serde_json::from_slice(signed_receipt)
        .map_err(|_|"W22_RECEIPT_ID_INVALID")?;
    if !identifier(&receipt.receipt_id)||receipt.receipt_id.len()<8{
        return Err("W22_RECEIPT_ID_INVALID");
    }
    let receipt_id=CString::new(receipt.receipt_id).map_err(|_|"W22_RECEIPT_ID_INVALID")?;
    {
        let mut stmt=Query(null_mut());
        let rc=unsafe{sqlite3_prepare_v2(db.0,UPDATE_ONE.as_ptr() as *const c_char,-1,
            &mut stmt.0,null_mut())};
        if rc!=SQLITE_OK||stmt.0.is_null(){return Err("W22_ACK_UPDATE_PREPARE_FAILED");}
        unsafe{
            if sqlite3_bind_text(stmt.0,1,receipt_id.as_ptr(),-1,None)!=SQLITE_OK||
               sqlite3_bind_int64(stmt.0,2,scope.outbox_seq)!=SQLITE_OK||
               sqlite3_bind_int64(stmt.0,3,scope.event_seq as i64)!=SQLITE_OK{
               return Err("W22_ACK_BIND_FAILED");
            }
            if sqlite3_step(stmt.0)!=SQLITE_DONE{return Err("W22_ACK_UPDATE_REJECTED");}
            if sqlite3_changes(db.0)!=1{return Err("W22_ACK_NOT_UNIQUE");}
        }
    }
    if inject_post_update_failure{return Err("W22_FORCED_TRANSACTION_ROLLBACK");}
    fixed_sql(db.0,b"COMMIT\0")?;
    transaction.1=true;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_non_synthetic_database_paths(){
        for p in [
          r"C:\Users\shop\AppData\Local\FOON\orders.sqlite",
          r"C:\Users\shop\Desktop\ack-fixture.sqlite",
          r"C:\Temp\ack-fixture.sqlite",
          "ack-fixture.sqlite"
        ]{
            assert!(verify_fixture(Path::new(p)).is_err());
        }
    }
    #[test]
    #[ignore="W22 requires an explicit temporary fixture created by its Node runner"]
    fn synthetic_signed_ack_transaction(){
        let path=std::env::var_os("FOON_W22_TEST_DB_PATH")
            .expect("W22_TEST_DB_REQUIRED");
        let signed=std::env::var("FOON_W22_SYNTHETIC_RECEIPT")
            .expect("W22_TEST_RECEIPT_REQUIRED");
        let case=std::env::var("FOON_W22_CASE").expect("W22_CASE_REQUIRED");
        let credential=DeviceSecret::from_bytes(SYNTHETIC_KEY.to_vec()).unwrap();
        let key=seal(&credential).unwrap();
        let mut scope=TrustedScope{
            outbox_seq:1,event_seq:11,order_id:"order-fixture-19",
            tenant_id:"tenant-fixture-w22",branch_id:"branch-fixture-w22",
            device_id:"device-fixture-w22"
        };
        if case=="wrong-tenant"{scope.tenant_id="other-tenant";}
        if case=="wrong-branch"{scope.branch_id="other-branch";}
        if case=="wrong-device"{scope.device_id="other-device";}
        if case=="wrong-seq"{scope.event_seq=12;}
        let rolled=case=="rollback";
        let result=ack_synthetic_transaction(Path::new(&path),scope,
            signed.as_bytes(),&key,rolled);
        match case.as_str(){
            "success" => {
                result.expect("W22_VALID_SIGNED_TRANSACTION_REQUIRED");
                assert!(matches!(ack_synthetic_transaction(Path::new(&path),
                   scope,signed.as_bytes(),&key,false),Err("W22_ALREADY_ACKED")));
            }
            "rollback" => assert!(matches!(result,Err("W22_FORCED_TRANSACTION_ROLLBACK"))),
            "wrong-tenant"|"wrong-branch"|"wrong-device"|"wrong-seq" =>
                assert!(matches!(result,Err("W22_SCOPE_OR_EVENT_MISMATCH"))),
            "bad-signature"|"changed-payload" =>
                assert!(matches!(result,Err("W22_RECEIPT_SIGNATURE_OR_DIGEST_INVALID"))),
            "orphan" => assert!(matches!(result,Err("W22_EVENT_SCHEMA_INVALID"))),
            _=>panic!("W22_UNKNOWN_SYNTHETIC_TEST_CASE")
        }
    }
}
