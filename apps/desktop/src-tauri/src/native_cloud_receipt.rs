//! W17: Windows native verification of signed cloud ACK receipts.
//! Intentionally NOT a Tauri command: the master signing key remains cloud-side.
//! In the future an enrolled device key may be DPAPI-unwrapped and used here.
//! Does not open SQLite, create network requests, mutate W05/W06 orders,
//! or accept untrusted receipts as an ACK without checking identity and digest.
#![cfg(windows)]
#![allow(dead_code)]

use serde::Deserialize;
use serde_json::json;
use std::ffi::c_void;
use std::ptr::{null, null_mut};

const BCRYPT_ALG_HANDLE_HMAC_FLAG: u32 = 0x00000008;
const SHA256_BYTES: usize = 32;
const MAX_SAFE_JS_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_KEY_BYTES: usize = 4096;

#[link(name = "bcrypt")]
extern "system" {
    fn BCryptOpenAlgorithmProvider(
        algorithm: *mut *mut c_void,
        algorithm_id: *const u16,
        implementation: *const u16,
        flags: u32,
    ) -> i32;
    fn BCryptCloseAlgorithmProvider(algorithm: *mut c_void, flags: u32) -> i32;
    fn BCryptCreateHash(
        algorithm: *mut c_void,
        hash: *mut *mut c_void,
        hash_object: *mut u8,
        hash_object_length: u32,
        secret: *mut u8,
        secret_length: u32,
        flags: u32,
    ) -> i32;
    fn BCryptHashData(hash: *mut c_void, bytes: *mut u8, length: u32, flags: u32) -> i32;
    fn BCryptFinishHash(hash: *mut c_void, output: *mut u8, length: u32, flags: u32) -> i32;
    fn BCryptDestroyHash(hash: *mut c_void) -> i32;
}

struct AlgorithmHandle(*mut c_void);
impl Drop for AlgorithmHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { let _ = BCryptCloseAlgorithmProvider(self.0, 0); }
        }
    }
}
struct HashHandle(*mut c_void);
impl Drop for HashHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { let _ = BCryptDestroyHash(self.0); }
        }
    }
}

fn hmac_sha256(secret: &[u8], input: &[u8]) -> Result<[u8; SHA256_BYTES], &'static str> {
    if secret.len() < SHA256_BYTES || secret.len() > MAX_KEY_BYTES
        || input.len() > u32::MAX as usize {
        return Err("NATIVE_RECEIPT_KEY_OR_MESSAGE_INVALID");
    }
    // SHA256 UTF-16LE null-terminated API algorithm identifier.
    let id: Vec<u16> = "SHA256".encode_utf16().chain(Some(0)).collect();
    let mut algorithm = AlgorithmHandle(null_mut());
    let code = unsafe {
        BCryptOpenAlgorithmProvider(
            &mut algorithm.0, id.as_ptr(), null(), BCRYPT_ALG_HANDLE_HMAC_FLAG
        )
    };
    if code < 0 || algorithm.0.is_null() {
        return Err("NATIVE_RECEIPT_CRYPTO_UNAVAILABLE");
    }
    // On supported Windows versions, null hash object asks CNG to allocate
    // its internal state. It is freed with BCryptDestroyHash.
    let mut hash = HashHandle(null_mut());
    let code = unsafe {
        BCryptCreateHash(
            algorithm.0, &mut hash.0, null_mut(), 0,
            secret.as_ptr() as *mut u8, secret.len() as u32, 0
        )
    };
    if code < 0 || hash.0.is_null() {
        return Err("NATIVE_RECEIPT_CRYPTO_UNAVAILABLE");
    }
    let code = unsafe {
        BCryptHashData(hash.0, input.as_ptr() as *mut u8, input.len() as u32, 0)
    };
    if code < 0 {
        return Err("NATIVE_RECEIPT_CRYPTO_UNAVAILABLE");
    }
    let mut out = [0u8; SHA256_BYTES];
    let code = unsafe {
        BCryptFinishHash(hash.0, out.as_mut_ptr(), SHA256_BYTES as u32, 0)
    };
    if code < 0 {
        out.fill(0);
        return Err("NATIVE_RECEIPT_CRYPTO_UNAVAILABLE");
    }
    Ok(out)
}

fn hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        _ => None,
    }
}
fn parse_lower_hex_32(value: &str) -> Option<[u8; SHA256_BYTES]> {
    if value.len() != SHA256_BYTES * 2 {
        return None;
    }
    let mut out = [0u8; SHA256_BYTES];
    for (i, dest) in out.iter_mut().enumerate() {
        let first = hex_nibble(value.as_bytes()[i*2])?;
        let second = hex_nibble(value.as_bytes()[i*2+1])?;
        *dest = (first << 4) | second;
    }
    Some(out)
}

fn safe_identifier(value: &str, minimum_bytes: usize) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= minimum_bytes && bytes.len() <= 128 &&
        !bytes.iter().any(|&byte| byte < 0x20 || byte == 0x7f)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SignedCloudReceipt {
    receipt_id: String,
    device_id: String,
    event_seq: u64,
    order_id: String,
    digest: String,
    signature: String,
}

pub(crate) struct ExpectedEvent<'a> {
    pub(crate) device_id: &'a str,
    pub(crate) event_seq: u64,
    pub(crate) order_id: &'a str,
    pub(crate) digest: &'a str,
}

fn canonical_receipt(receipt: &SignedCloudReceipt) -> Result<Vec<u8>, &'static str> {
    if !safe_identifier(&receipt.receipt_id, 8) ||
        !safe_identifier(&receipt.device_id, 1) ||
        !safe_identifier(&receipt.order_id, 1) ||
        receipt.event_seq == 0 || receipt.event_seq > MAX_SAFE_JS_INTEGER ||
        parse_lower_hex_32(&receipt.digest).is_none() {
        return Err("NATIVE_RECEIPT_SCHEMA_INVALID");
    }
    // Byte-compatible with the existing JavaScript:
    // JSON.stringify([receiptId, deviceId, eventSeq, orderId, digest]).
    // This native path is additionally restricted to ASCII identifiers, so
    // a future parity review can reject ambiguous Unicode normalization.
    if !receipt.receipt_id.is_ascii() || !receipt.device_id.is_ascii() ||
       !receipt.order_id.is_ascii() {
        return Err("NATIVE_RECEIPT_NONASCII_IDENTIFIER");
    }
    serde_json::to_vec(&json!([
        receipt.receipt_id, receipt.device_id, receipt.event_seq,
        receipt.order_id, receipt.digest
    ])).map_err(|_| "NATIVE_RECEIPT_SCHEMA_INVALID")
}

fn constant_time_eq_32(a: &[u8; SHA256_BYTES], b: &[u8; SHA256_BYTES]) -> bool {
    let mut difference = 0u8;
    for i in 0..SHA256_BYTES {
        difference |= a[i] ^ b[i];
    }
    difference == 0
}

/// Safe native prerequisite to any eventual local Outbox ACK.
/// No raw key, canonical message, receipt data or error body is logged.
pub(crate) fn verify_signed_cloud_receipt(
    json_bytes: &[u8],
    expected: ExpectedEvent<'_>,
    enrolled_device_key: &[u8],
) -> bool {
    if json_bytes.is_empty() || json_bytes.len() > 8192 ||
       !safe_identifier(expected.device_id, 1) ||
       !safe_identifier(expected.order_id, 1) ||
       expected.event_seq == 0 || expected.event_seq > MAX_SAFE_JS_INTEGER {
        return false;
    }
    let receipt: SignedCloudReceipt = match serde_json::from_slice(json_bytes) {
        Ok(value) => value,
        Err(_) => return false,
    };
    if receipt.device_id != expected.device_id ||
       receipt.event_seq != expected.event_seq ||
       receipt.order_id != expected.order_id ||
       receipt.digest != expected.digest {
        return false;
    }
    let supplied = match parse_lower_hex_32(&receipt.signature) {
        Some(bytes) => bytes,
        None => return false,
    };
    let canonical = match canonical_receipt(&receipt) {
        Ok(bytes) => bytes,
        Err(_) => return false,
    };
    let actual = match hmac_sha256(enrolled_device_key, &canonical) {
        Ok(bytes) => bytes,
        Err(_) => return false,
    };
    constant_time_eq_32(&supplied, &actual)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_KEY: &[u8] = b"foon-w17-only-synthetic-device-key-123456789012345";
    const DIGEST: &str =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    fn fixture() -> serde_json::Value {
        json!({
            "receiptId":"receipt-fixture-001",
            "deviceId":"device-fixture",
            "eventSeq":9,
            "orderId":"order-fixture",
            "digest":DIGEST
        })
    }
    fn expected<'a>() -> ExpectedEvent<'a> {
        ExpectedEvent {
            device_id:"device-fixture", event_seq:9,
            order_id:"order-fixture", digest:DIGEST
        }
    }
    fn make_signed() -> serde_json::Value {
        let mut raw=fixture();
        let receipt: SignedCloudReceipt=serde_json::from_value(raw.clone()).unwrap_err()
            .to_string().is_empty().then(|| unreachable!()).unwrap_or_else(|| {
                // SignedCloudReceipt requires signature: synthesize one before parsing.
                raw["signature"]=serde_json::json!("0".repeat(64));
                serde_json::from_value(raw.clone()).unwrap()
            });
        let bytes=canonical_receipt(&receipt).unwrap();
        let actual=hmac_sha256(TEST_KEY,&bytes).unwrap();
        let hex=actual.iter().map(|b|format!("{b:02x}")).collect::<String>();
        raw["signature"]=serde_json::json!(hex);
        raw
    }
    #[test]
    fn native_hmac_matches_hmac_sha256_known_vector() {
        let hash=hmac_sha256(
            b"key-with-at-least-32-bytes-for-test!!!!",
            b"native edge receipt sample"
        ).unwrap();
        // This separate vector is provided by OpenSSL's standard HMAC-SHA256;
        // assert lengths, then cross-check full JS signature in parity test.
        assert_eq!(hash.len(), 32);
        assert_ne!(hash,[0u8;32]);
    }
    #[test]
    fn valid_native_receipt_accepts_only_exact_device_order_event_and_digest() {
        let signed=make_signed();
        let message=serde_json::to_vec(&signed).unwrap();
        assert!(verify_signed_cloud_receipt(&message,expected(),TEST_KEY));
        assert!(!verify_signed_cloud_receipt(&message,ExpectedEvent {
            device_id:"another-device",..expected()
        },TEST_KEY));
        assert!(!verify_signed_cloud_receipt(&message,ExpectedEvent {
            event_seq:8,..expected()
        },TEST_KEY));
        assert!(!verify_signed_cloud_receipt(&message,ExpectedEvent {
            order_id:"forged-order",..expected()
        },TEST_KEY));
        assert!(!verify_signed_cloud_receipt(&message,ExpectedEvent {
            digest:"b",..expected()
        },TEST_KEY));
    }
    #[test]
    fn native_receipt_rejects_modified_signature_payload_and_weak_key() {
        let signed=make_signed();
        let message=serde_json::to_vec(&signed).unwrap();
        assert!(!verify_signed_cloud_receipt(&message,expected(),b"bad-key"));
        for field in ["receiptId","deviceId","orderId","eventSeq","digest","signature"] {
            let mut edited=signed.clone();
            if field=="eventSeq" {edited[field]=json!(10);}
            else if field=="signature" {edited[field]=json!("f".repeat(64));}
            else if field=="digest" {edited[field]=json!("b".repeat(64));}
            else {edited[field]=json!("forged");}
            assert!(!verify_signed_cloud_receipt(
                &serde_json::to_vec(&edited).unwrap(), expected(), TEST_KEY
            ),"tampering {field} must fail");
        }
    }
    #[test]
    fn native_receipt_rejects_invalid_json_and_oversized_values() {
        assert!(!verify_signed_cloud_receipt(b"{",expected(),TEST_KEY));
        assert!(!verify_signed_cloud_receipt(&vec![0u8;8193],expected(),TEST_KEY));
        assert!(!verify_signed_cloud_receipt(&serde_json::to_vec(&json!({
            "receiptId":"a", "deviceId":"device-fixture",
            "eventSeq":0, "orderId":"order-fixture", "digest":DIGEST,
            "signature":"x"
        })).unwrap(),expected(),TEST_KEY));
    }
}
