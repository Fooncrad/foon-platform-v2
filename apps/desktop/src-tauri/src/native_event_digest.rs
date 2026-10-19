//! W19: native Windows SHA-256 event digest with JS field-order parity.
//! The source of payload_json MUST be a locally trusted, already-stringified
//! JavaScript JSON payload. We preserve its exact serialized byte order using
//! serde_json::RawValue, because serde_json::Value map ordering is different
//! from JavaScript object insertion order by default.
//!
//! No SQLite, network, device enrollment, ACK, production data or WebView API.
//! This is an isolated parity proof; final local DB provenance and native
//! Outbox ACK are separate security requirements.
#![cfg(windows)]
#![allow(dead_code)]

use serde::Serialize;
use serde_json::value::RawValue;
use std::ffi::c_void;
use std::ptr::{null, null_mut};

const MAX_SAFE_JS_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_PAYLOAD_BYTES: usize = 16_384;
const HASH_BYTES: usize = 32;

#[link(name = "bcrypt")]
extern "system" {
    fn BCryptOpenAlgorithmProvider(
        handle: *mut *mut c_void, algorithm: *const u16,
        implementation: *const u16, flags: u32,
    ) -> i32;
    fn BCryptCloseAlgorithmProvider(handle: *mut c_void, flags: u32) -> i32;
    fn BCryptCreateHash(
        algorithm: *mut c_void, hash: *mut *mut c_void,
        hash_object: *mut u8, hash_object_length: u32,
        secret: *mut u8, secret_length: u32, flags: u32,
    ) -> i32;
    fn BCryptHashData(hash: *mut c_void, data: *mut u8, length: u32, flags: u32) -> i32;
    fn BCryptFinishHash(hash: *mut c_void, output: *mut u8, length: u32, flags: u32) -> i32;
    fn BCryptDestroyHash(hash: *mut c_void) -> i32;
}
struct Algorithm(*mut c_void);
impl Drop for Algorithm {
    fn drop(&mut self) {
        if !self.0.is_null() { unsafe { let _ = BCryptCloseAlgorithmProvider(self.0, 0); } }
    }
}
struct Hash(*mut c_void);
impl Drop for Hash {
    fn drop(&mut self) {
        if !self.0.is_null() { unsafe { let _ = BCryptDestroyHash(self.0); } }
    }
}
pub(crate) fn sha256(bytes: &[u8]) -> Result<[u8; HASH_BYTES], &'static str> {
    if bytes.is_empty() || bytes.len() > u32::MAX as usize {
        return Err("NATIVE_DIGEST_INVALID_BYTES");
    }
    let sha256_id: Vec<u16> = "SHA256".encode_utf16().chain(Some(0)).collect();
    let mut algorithm = Algorithm(null_mut());
    let status = unsafe {
        BCryptOpenAlgorithmProvider(&mut algorithm.0, sha256_id.as_ptr(), null(), 0)
    };
    if status < 0 || algorithm.0.is_null() {
        return Err("NATIVE_DIGEST_CRYPTO_UNAVAILABLE");
    }
    let mut hash = Hash(null_mut());
    let status = unsafe {
        BCryptCreateHash(algorithm.0, &mut hash.0, null_mut(), 0, null_mut(), 0, 0)
    };
    if status < 0 || hash.0.is_null() {
        return Err("NATIVE_DIGEST_CRYPTO_UNAVAILABLE");
    }
    let status = unsafe {
        BCryptHashData(hash.0, bytes.as_ptr() as *mut u8, bytes.len() as u32, 0)
    };
    if status < 0 { return Err("NATIVE_DIGEST_CRYPTO_UNAVAILABLE"); }
    let mut result = [0u8; HASH_BYTES];
    let status = unsafe {
        BCryptFinishHash(hash.0, result.as_mut_ptr(), HASH_BYTES as u32, 0)
    };
    if status < 0 {
        result.fill(0);
        return Err("NATIVE_DIGEST_CRYPTO_UNAVAILABLE");
    }
    Ok(result)
}

#[derive(Serialize)]
struct JSOrderEvent<'a> {
    seq: u64,
    #[serde(rename="orderId")]
    order_id: &'a str,
    kind: &'a str,
    payload: &'a RawValue,
}

/// This is intentionally stricter than the existing JavaScript contract:
/// the payload must already be compact JSON produced by the trusted local
/// JSON.stringify path, not an arbitrary, externally supplied JSON body.
/// Failure returns an error and MUST never mean 'ack now'.
fn is_compact_json(value: &str) -> bool {
    let mut in_string=false;
    let mut escaped=false;
    for ch in value.chars() {
        if in_string {
            if escaped { escaped=false; }
            else if ch=='\\' { escaped=true; }
            else if ch=='"' { in_string=false; }
        } else if ch=='"' { in_string=true; }
        else if ch.is_whitespace() { return false; }
    }
    !in_string && !escaped
}
fn valid_order_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 128 && value.is_ascii() &&
        value.bytes().all(|b|b >= 0x20 && b < 0x7f)
}
pub(crate) struct TrustedRawEvent<'a> {
    pub(crate) seq: u64,
    pub(crate) order_id: &'a str,
    pub(crate) kind: &'a str,
    pub(crate) payload_json: &'a str,
}

/// Format matches existing JS eventDigest() key order:
/// JSON.stringify({seq,orderId,kind,payload}).
/// This does not infer that payload_json came from a trusted SQLite event:
/// provenance is the responsibility of a future native local DB adapter.
pub(crate) fn digest_trusted_event(event: TrustedRawEvent<'_>) -> Result<[u8; 32], &'static str> {
    if event.seq == 0 || event.seq > MAX_SAFE_JS_INTEGER ||
       !valid_order_id(event.order_id) ||
       !matches!(event.kind, "created" | "status") ||
       event.payload_json.is_empty() || event.payload_json.len() > MAX_PAYLOAD_BYTES ||
       !event.payload_json.starts_with('{') || !event.payload_json.ends_with('}') ||
       !is_compact_json(event.payload_json) {
        return Err("NATIVE_DIGEST_INVALID_EVENT");
    }
    let payload=RawValue::from_string(event.payload_json.to_owned())
        .map_err(|_|"NATIVE_DIGEST_INVALID_PAYLOAD_JSON")?;
    let bytes=serde_json::to_vec(&JSOrderEvent {
        seq:event.seq,
        order_id:event.order_id,
        kind:event.kind,
        payload:payload.as_ref(),
    }).map_err(|_|"NATIVE_DIGEST_INVALID_PAYLOAD_JSON")?;
    sha256(&bytes)
}
fn parse_digest(value: &str) -> Option<[u8;32]> {
    if value.len()!=64{return None;}
    let mut bytes=[0u8;32];
    for (i,byte) in bytes.iter_mut().enumerate() {
        let nibble=|b| match b {
            b'0'..=b'9'=>Some(b-b'0'),
            b'a'..=b'f'=>Some(b-b'a'+10),
            _=>None,
        };
        *byte = (nibble(value.as_bytes()[2*i])?<<4)|
            nibble(value.as_bytes()[2*i+1])?;
    }
    Some(bytes)
}
pub(crate) fn verify_expected_event_digest(
    event: TrustedRawEvent<'_>,
    declared_digest: &str,
) -> bool {
    let supplied=match parse_digest(declared_digest) {
        Some(bytes)=>bytes,
        None=>return false,
    };
    let expected=match digest_trusted_event(event) {
        Ok(bytes)=>bytes,
        Err(_)=>return false,
    };
    let mut different=0u8;
    for i in 0..32 { different |= supplied[i]^expected[i]; }
    different==0
}

#[cfg(test)]
mod tests {
    use super::*;

    const CREATED: &str = r#"{"id":"order-fixture-19","branchId":"branch-fixture-19","items":[{"id":"item-A","quantity":2,"expectedUnitCents":950,"expectedCurrency":"SAR"}]}"#;
    const STATUS: &str = r#"{"id":"order-fixture-19","status":"preparing","updatedAt":"2026-10-19T00:00:00.000Z"}"#;
    const ARABIC: &str = r#"{"note":"قهوة عربية","status":"ready"}"#;

    fn event<'a>(seq:u64,kind:&'a str,payload_json:&'a str)->TrustedRawEvent<'a>{
        TrustedRawEvent{seq,order_id:"order-fixture-19",kind,payload_json}
    }
    fn hex(bytes: &[u8])->String {
        bytes.iter().map(|b|format!("{b:02x}")).collect::<String>()
    }

    #[test]
    fn sha256_native_matches_standard_abc_vector() {
        assert_eq!(hex(&sha256(b"abc").unwrap()),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
    #[test]
    fn created_event_sha256_preserves_js_payload_property_order() {
        let hash=digest_trusted_event(event(11,"created",CREATED)).unwrap();
        assert_eq!(hex(&hash),
            "2bf8b997b4161b8a3535364f3989439a14e0419d7ef90e1ac7ef2c298f7e092c");
        assert!(verify_expected_event_digest(event(11,"created",CREATED),&hex(&hash)));
        assert!(!verify_expected_event_digest(event(11,"created",CREATED),
            "a".repeat(64).as_str()));
    }
    #[test]
    fn status_event_compatible_with_node_existing_contract() {
        let hash=digest_trusted_event(event(12,"status",STATUS)).unwrap();
        assert_eq!(hex(&hash),
            "1bee33364a8b066265ca555ec89f82bb7e46f44a277675037eb20e67d8fe5343");
        assert!(!verify_expected_event_digest(event(13,"status",STATUS),&hex(&hash)));
        assert!(!verify_expected_event_digest(event(12,"created",STATUS),&hex(&hash)));
    }
    #[test]
    fn utf8_arabic_text_is_hashed_as_json_utf8_without_escaping() {
        assert_eq!(hex(&digest_trusted_event(event(13,"status",ARABIC)).unwrap()),
            "51f3d30997ae2dd4154e14de86755a30e2b52c5dbfd0c0e3f5859a358762c536");
    }
    #[test]
    fn malformed_or_noncanonical_payload_fails_closed() {
        for bad in [
            r#"{"item": 1}"#, r#"{"item":"open"#,
            "[]", "null", r#"{"x":1}\n"#, "",
        ] {
            assert!(digest_trusted_event(event(14,"status",bad)).is_err());
        }
        assert!(digest_trusted_event(event(0,"created",CREATED)).is_err());
        assert!(digest_trusted_event(event(9007199254740992,"created",CREATED)).is_err());
        assert!(digest_trusted_event(event(12,"any",STATUS)).is_err());
        assert!(digest_trusted_event(TrustedRawEvent {
            seq:12,order_id:"",kind:"status",payload_json:STATUS
        }).is_err());
    }
}
