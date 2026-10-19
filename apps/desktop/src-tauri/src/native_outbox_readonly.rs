//! W20: read-only Windows native SQLite outbox snapshot for a disposable
//! isolated fixture only. NEVER use this adapter on merchant/W05/W06 files.
//! Native WinSQLite3 avoids adding new Cargo dependencies.
//! No INSERT, UPDATE, ALTER, CREATE, DROP, ACK or network requests.
#![cfg(windows)]
#![allow(dead_code)]

use std::ffi::{c_char, c_int, c_uchar, c_void, CString};
use std::fs;
use std::path::{Path, PathBuf};
use std::collections::BTreeSet;
use std::ptr::{null, null_mut};
use crate::native_event_digest::{digest_trusted_event, TrustedRawEvent};

const SQLITE_OK: c_int = 0;
const SQLITE_ROW: c_int = 100;
const SQLITE_DONE: c_int = 101;
const SQLITE_OPEN_READONLY: c_int = 0x00000001;
const SQLITE_OPEN_FULLMUTEX: c_int = 0x00010000;
const MAX_EVENTS: usize = 32;
const MAX_JSON_LENGTH: usize = 16_384;
const MAX_ORDER_ID_BYTES: usize = 128;
const MAX_DATABASE_BYTES: u64 = 1024 * 1024;
const TEST_DIRECTORY_PREFIX: &str = "FOON-W20-Fixture-";
const TEST_DATABASE_FILENAME: &str = "events.sqlite";

// This SQL is a frozen SELECT against the W05/W06 schema but is executed
// ONLY on the disposable W20 fixture file admitted by verify_fixture_path.
const PENDING_EVENTS_SQL: &[u8] =
    b"SELECT o.seq,o.event_seq,e.order_id,e.kind,e.payload \
       FROM outbox AS o LEFT JOIN events AS e ON e.seq=o.event_seq \
       WHERE o.synced_at IS NULL ORDER BY o.seq ASC LIMIT 33\0";

#[link(name = "winsqlite3")]
extern "C" {
    fn sqlite3_open_v2(
        filename: *const c_char, db: *mut *mut c_void,
        flags: c_int, vfs: *const c_char
    ) -> c_int;
    fn sqlite3_close_v2(db: *mut c_void) -> c_int;
    fn sqlite3_prepare_v2(
        db: *mut c_void, sql: *const c_char, sql_length: c_int,
        statement: *mut *mut c_void, tail: *mut *const c_char
    ) -> c_int;
    fn sqlite3_step(statement: *mut c_void) -> c_int;
    fn sqlite3_finalize(statement: *mut c_void) -> c_int;
    fn sqlite3_column_type(statement: *mut c_void, column: c_int) -> c_int;
    fn sqlite3_column_int64(statement: *mut c_void, column: c_int) -> i64;
    fn sqlite3_column_text(statement: *mut c_void, column: c_int) -> *const c_uchar;
    fn sqlite3_column_bytes(statement: *mut c_void, column: c_int) -> c_int;
}

const SQLITE_INTEGER: c_int = 1;
const SQLITE_TEXT: c_int = 3;

struct Db(*mut c_void);
impl Drop for Db {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { let _ = sqlite3_close_v2(self.0); }
        }
    }
}
struct Statement(*mut c_void);
impl Drop for Statement {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { let _ = sqlite3_finalize(self.0); }
        }
    }
}

fn is_hex_id(s: &str) -> bool {
    s.len()==32 && s.bytes().all(|b|b.is_ascii_hexdigit())
}
fn verify_fixture_path(path: &Path) -> Result<PathBuf, &'static str> {
    if !path.is_absolute() || path.file_name().and_then(|s|s.to_str())!=Some(TEST_DATABASE_FILENAME) {
        return Err("W20_TEMP_DB_PATH_REQUIRED");
    }
    let parent=path.parent().ok_or("W20_TEMP_DB_PATH_FORBIDDEN")?;
    let name=parent.file_name().and_then(|s|s.to_str()).ok_or("W20_TEMP_DB_PATH_FORBIDDEN")?;
    let suffix=name.strip_prefix(TEST_DIRECTORY_PREFIX).ok_or("W20_TEMP_DB_PATH_FORBIDDEN")?;
    if !is_hex_id(suffix) { return Err("W20_TEMP_DB_PATH_FORBIDDEN"); }

    let expected_temp=fs::canonicalize(std::env::temp_dir())
        .map_err(|_|"W20_TEMP_ROOT_UNAVAILABLE")?;
    let fixture_dir=fs::canonicalize(parent)
        .map_err(|_|"W20_TEMP_DB_PATH_FORBIDDEN")?;
    if fixture_dir.parent()!=Some(expected_temp.as_path()) {
        return Err("W20_TEMP_DB_PATH_FORBIDDEN");
    }
    let db_info=fs::symlink_metadata(path)
        .map_err(|_|"W20_TEMP_DB_NOT_READY")?;
    if !db_info.is_file() || db_info.file_type().is_symlink() ||
       db_info.len()==0 || db_info.len()>MAX_DATABASE_BYTES {
        return Err("W20_TEMP_DB_NOT_REGULAR_FILE");
    }
    let real_db=fs::canonicalize(path)
        .map_err(|_|"W20_TEMP_DB_PATH_FORBIDDEN")?;
    if real_db.parent()!=Some(fixture_dir.as_path()) ||
       real_db.file_name().and_then(|s|s.to_str())!=Some(TEST_DATABASE_FILENAME) {
        return Err("W20_TEMP_DB_PATH_FORBIDDEN");
    }
    Ok(real_db)
}

unsafe fn sqlite_text(stmt: *mut c_void, index: c_int, max: usize) -> Result<String, &'static str> {
    if sqlite3_column_type(stmt,index)!=SQLITE_TEXT {
        return Err("W20_EVENT_INVALID_TEXT");
    }
    let length=sqlite3_column_bytes(stmt,index);
    if length < 1 || length as usize > max {
        return Err("W20_EVENT_INVALID_TEXT");
    }
    let bytes=sqlite3_column_text(stmt,index);
    if bytes.is_null() { return Err("W20_EVENT_INVALID_TEXT"); }
    let raw=std::slice::from_raw_parts(bytes, length as usize);
    let string=std::str::from_utf8(raw).map_err(|_|"W20_EVENT_INVALID_UTF8")?;
    Ok(string.to_string())
}
unsafe fn sqlite_positive_int(stmt: *mut c_void,index: c_int) -> Result<u64, &'static str> {
    if sqlite3_column_type(stmt,index)!=SQLITE_INTEGER {return Err("W20_EVENT_INVALID_SEQ");}
    let value=sqlite3_column_int64(stmt,index);
    if value < 1 || value > 9_007_199_254_740_991 {
        return Err("W20_EVENT_INVALID_SEQ");
    }
    Ok(value as u64)
}
fn lower_hex(bytes: &[u8]) -> String {
    const HEX: &[u8;16]=b"0123456789abcdef";
    let mut out=String::with_capacity(bytes.len()*2);
    for b in bytes {
        out.push(HEX[(b>>4) as usize] as char);
        out.push(HEX[(b&15) as usize] as char);
    }
    out
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct PendingEventFingerprint {
    pub(crate) outbox_seq: u64,
    pub(crate) event_seq: u64,
    pub(crate) digest_hex: String,
}

/// Return fingerprints only. Do not return order IDs, raw JSON, credentials,
/// customer notes, or a handle to SQLite. This is a local test adapter, not
/// an authorized network sender or a production SQLite migration.
pub(crate) fn read_fixture_pending_fingerprints(
    db_path: &Path
) -> Result<Vec<PendingEventFingerprint>, &'static str> {
    let trusted=verify_fixture_path(db_path)?;
    let path_str=trusted.to_str().ok_or("W20_TEMP_DB_PATH_FORBIDDEN")?;
    let name=CString::new(path_str).map_err(|_|"W20_TEMP_DB_PATH_FORBIDDEN")?;

    let mut db=Db(null_mut());
    let code=unsafe {sqlite3_open_v2(
        name.as_ptr(), &mut db.0,
        SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX, null()
    )};
    if code!=SQLITE_OK || db.0.is_null() {
        return Err("W20_SQLITE_READONLY_OPEN_FAILED");
    }
    let mut query=Statement(null_mut());
    let code=unsafe {sqlite3_prepare_v2(
        db.0, PENDING_EVENTS_SQL.as_ptr() as *const c_char, -1,
        &mut query.0, null_mut()
    )};
    if code!=SQLITE_OK || query.0.is_null() {
        return Err("W20_SQLITE_SCHEMA_NOT_COMPATIBLE");
    }

    let mut rows=Vec::new();
    let mut seen_event_seqs=BTreeSet::new();
    loop {
        match unsafe{sqlite3_step(query.0)} {
            SQLITE_DONE=>break,
            SQLITE_ROW=>{
                if rows.len()>=MAX_EVENTS {
                    return Err("W20_TOO_MANY_PENDING_EVENTS");
                }
                let (outbox_seq,event_seq,order_id,kind,payload)=unsafe {
                    (
                        sqlite_positive_int(query.0,0)?,
                        sqlite_positive_int(query.0,1)?,
                        sqlite_text(query.0,2,MAX_ORDER_ID_BYTES)?,
                        sqlite_text(query.0,3,16)?,
                        sqlite_text(query.0,4,MAX_JSON_LENGTH)?
                    )
                };
                if !seen_event_seqs.insert(event_seq) {
                    return Err("W21_DUPLICATED_EVENT_REFERENCE");
                }
                if !order_id.is_ascii() || !matches!(kind.as_str(),"created"|"status") {
                    return Err("W20_EVENT_INVALID_KIND_OR_SCOPE");
                }
                let fingerprint=digest_trusted_event(TrustedRawEvent {
                    seq:event_seq,order_id:&order_id,kind:&kind,payload_json:&payload
                }).map_err(|_|"W20_EVENT_DIGEST_REJECTED")?;
                rows.push(PendingEventFingerprint {
                    outbox_seq,event_seq,digest_hex:lower_hex(&fingerprint)
                });
            },
            _=>return Err("W20_SQLITE_READ_FAILED")
        }
    }
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn read_is_refused_for_non_fixture_database_paths() {
        for invalid in [
            r"C:\Users\Somebody\AppData\Local\com.foon.desktop\w05-durable-test\orders.sqlite",
            r"C:\Users\Somebody\Desktop\orders.sqlite",
            r"C:\Temp\events.sqlite",
        ] {
            assert!(read_fixture_pending_fingerprints(Path::new(invalid)).is_err());
        }
    }
    #[test]
    fn fixture_path_validator_refuses_relative_location() {
        assert!(verify_fixture_path(Path::new("events.sqlite")).is_err());
        assert!(verify_fixture_path(Path::new("..\\events.sqlite")).is_err());
    }
    #[test]
    #[ignore = "W21 adversarial synthetic-only fixture runner with explicit temp path"]
    fn w21_fixture_boundary() {
        let case=std::env::var("FOON_W21_CASE")
            .expect("W21_SYNTHETIC_CASE_REQUIRED");
        let db_path=std::env::var_os("FOON_W21_TEST_DB_PATH")
            .expect("W21_FRESH_TEST_DB_PATH_REQUIRED");
        let outcome=read_fixture_pending_fingerprints(Path::new(&db_path));
        match case.as_str() {
            "wal" => {
                let rows=outcome.expect("W21_WAL_PENDING_EVENTS_MUST_READ");
                assert_eq!(rows.len(),4);
                assert_eq!(rows[3].event_seq,15);
                assert_eq!(rows[3].outbox_seq,5);
                let expected=std::env::var("FOON_W21_EXPECTED_DIGEST")
                    .expect("W21_WAL_DIGEST_REQUIRED");
                assert_eq!(rows[3].digest_hex,expected);
            },
            "corrupt" => assert!(matches!(outcome,Err("W20_EVENT_DIGEST_REJECTED"))),
            "orphan" => assert!(matches!(outcome,Err("W20_EVENT_INVALID_TEXT"))),
            "duplicate" => assert!(matches!(outcome,Err("W21_DUPLICATED_EVENT_REFERENCE"))),
            "limit" => assert!(matches!(outcome,Err("W20_TOO_MANY_PENDING_EVENTS"))),
            _ => panic!("W21_UNKNOWN_FIXTURE_CASE")
        }
    }

    #[test]
    fn native_reader_reports_only_pending_rows_with_node_compatible_digests() {
        let path=std::env::var_os("FOON_W20_TEST_DB_PATH")
            .expect("W20_REQUIRE_EXPLICIT_TEMP_FIXTURE_CREATED_BY_SCRIPT");
        let rows=read_fixture_pending_fingerprints(Path::new(&path))
            .expect("W20_FRESH_TEMP_FIXTURE_REQUIRED");
        assert_eq!(rows.len(),3);
        assert_eq!((rows[0].outbox_seq,rows[0].event_seq),(1,11));
        assert_eq!((rows[1].outbox_seq,rows[1].event_seq),(2,12));
        assert_eq!((rows[2].outbox_seq,rows[2].event_seq),(3,13));
        assert_eq!(rows[0].digest_hex,
            "2bf8b997b4161b8a3535364f3989439a14e0419d7ef90e1ac7ef2c298f7e092c");
        assert_eq!(rows[1].digest_hex,
            "1bee33364a8b066265ca555ec89f82bb7e46f44a277675037eb20e67d8fe5343");
        assert_eq!(rows[2].digest_hex,
            "51f3d30997ae2dd4154e14de86755a30e2b52c5dbfd0c0e3f5859a358762c536");
    }
}
