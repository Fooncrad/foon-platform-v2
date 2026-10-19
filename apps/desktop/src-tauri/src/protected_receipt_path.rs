//! W18: bridge two previously tested native Windows primitives: DPAPI
//! CURRENT_USER (W12) and CNG HMAC receipt verification (W17).
//!
//! This is a *pure test-stage verification boundary* with no SQLite ACK,
//! Tauri command, network call, plaintext persistence or enrollment.
//! The server's master signing key must NEVER be embedded in the client.
//! A future limited per-device verification credential needs its own secure
//! server enrollment / expiry / revocation and authorization protocol.
#![cfg(windows)]
#![allow(dead_code)]

use crate::native_cloud_receipt::{verify_signed_cloud_receipt, ExpectedEvent};
use crate::windows_secret_store::{unseal, SealedDeviceSecret};

/// Verify a response using a Windows CURRENT_USER-protected synthetic device
/// credential. Plaintext is owned by DeviceSecret and zeroed on Drop.
/// No raw token or detailed error information leaves the Rust boundary.
/// This function does NOT acknowledge events. A native SQLite worker, once
/// implemented, must check local event digest and DB scope independently.
pub(crate) fn verify_receipt_with_protected_device_key(
    signed_receipt_json: &[u8],
    expected: ExpectedEvent<'_>,
    encrypted_device_key: &SealedDeviceSecret,
) -> bool {
    // Never spend OS crypto work for absurd/missing remote payloads.
    if signed_receipt_json.is_empty() || signed_receipt_json.len() > 8192 {
        return false;
    }
    let plaintext = match unseal(encrypted_device_key) {
        Ok(temporary_key) => temporary_key,
        Err(_) => return false,
    };
    verify_signed_cloud_receipt(
        signed_receipt_json,
        expected,
        plaintext.bytes(),
    )
    // plaintext is dropped / wiped here, including verification failure.
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::windows_secret_store::{seal, DeviceSecret};
    use serde_json::{json, Value};

    const KEY: &[u8] = b"foon-w17-only-synthetic-device-key-123456789012345";
    const DIGEST: &str =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const SIGNATURE: &str =
        "e1710acbf388b694869530f7625fba261a49f6130ed678420049e74beca594db";

    fn fixture() -> Value {
        json!({
            "receiptId": "receipt-fixture-001",
            "deviceId": "device-fixture",
            "eventSeq": 9,
            "orderId": "order-fixture",
            "digest": DIGEST,
            "signature": SIGNATURE
        })
    }
    fn event<'a>() -> ExpectedEvent<'a> {
        ExpectedEvent {
            device_id: "device-fixture",
            event_seq: 9,
            order_id: "order-fixture",
            digest: DIGEST,
        }
    }
    fn synthetic_sealed_key() -> SealedDeviceSecret {
        // Never use these test bytes for a real merchant device.
        let key = DeviceSecret::from_bytes(KEY.to_vec()).unwrap();
        seal(&key).unwrap()
    }

    #[test]
    fn dpapi_unseal_then_cng_verify_accepts_only_original_test_receipt() {
        let sealed = synthetic_sealed_key();
        let json = serde_json::to_vec(&fixture()).unwrap();
        assert!(verify_receipt_with_protected_device_key(
            &json, event(), &sealed
        ));
        let mismatched = ExpectedEvent {
            event_seq: 10,
            ..event()
        };
        assert!(!verify_receipt_with_protected_device_key(
            &json, mismatched, &sealed
        ));
    }

    #[test]
    fn signed_receipt_tampering_fails_closed_after_native_dpapi_unseal() {
        let sealed = synthetic_sealed_key();
        for name in [
            "receiptId", "deviceId", "eventSeq",
            "orderId", "digest", "signature",
        ] {
            let mut altered = fixture();
            altered[name] = match name {
                "eventSeq" => json!(10),
                "digest" => json!("b".repeat(64)),
                "signature" => json!("f".repeat(64)),
                _ => json!("tampered"),
            };
            assert!(!verify_receipt_with_protected_device_key(
                &serde_json::to_vec(&altered).unwrap(), event(), &sealed
            ), "unexpected acceptance of altered {name}");
        }
    }

    #[test]
    fn unrelated_or_damaged_windows_key_never_authorizes_receipt() {
        let genuine = synthetic_sealed_key();
        let forged_key = DeviceSecret::from_bytes(
            b"other-synthetic-device-key-must-never-match-456789".to_vec()
        ).unwrap();
        let forged = seal(&forged_key).unwrap();
        let json = serde_json::to_vec(&fixture()).unwrap();
        assert!(!verify_receipt_with_protected_device_key(
            &json, event(), &forged
        ));
        let mut damaged = genuine.ciphertext().to_vec();
        // DPAPI has integrity protection: an unexpected ciphertext cannot
        // authorize even a valid server receipt.
        let end = damaged.len() - 1;
        damaged[end] ^= 0x80;
        let invalid = SealedDeviceSecret::from_ciphertext(damaged).unwrap();
        assert!(!verify_receipt_with_protected_device_key(
            &json, event(), &invalid
        ));
    }

    #[test]
    fn malformed_or_oversized_input_never_returns_ack_authorization() {
        let sealed = synthetic_sealed_key();
        assert!(!verify_receipt_with_protected_device_key(b"", event(), &sealed));
        assert!(!verify_receipt_with_protected_device_key(
            &vec![0u8; 8193], event(), &sealed
        ));
        assert!(!verify_receipt_with_protected_device_key(
            b"not-json", event(), &sealed
        ));
        let unrelated = SealedDeviceSecret::from_ciphertext(vec![42u8; 96])
            .unwrap();
        assert!(!verify_receipt_with_protected_device_key(
            &serde_json::to_vec(&fixture()).unwrap(), event(), &unrelated
        ));
    }
}
