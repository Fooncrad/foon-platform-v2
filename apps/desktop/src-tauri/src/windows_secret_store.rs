//! Windows-only native key wrapping proof for FOON Desktop W12.
//!
//! DPAPI CURRENT_USER, never LOCAL_MACHINE. This intentionally does not
//! persist secrets or expose a Tauri command. The W05/W06 synthetic SQLite
//! runtime and existing token rotation are NOT modified.
//!
//! Limitations: code executing as the same logged-in Windows user can call
//! DPAPI to decrypt; this is at-rest protection, NOT a DRM mechanism.
#![cfg(windows)]
#![allow(dead_code)]

use std::ffi::c_void;
use std::ptr::{null, null_mut, write_volatile};
use std::slice;
use std::sync::atomic::{compiler_fence, Ordering};

const UI_FORBIDDEN: u32 = 0x01;
const MAX_SECRET_SIZE: usize = 4096;
const MAX_DPAPI_BLOB: usize = 64 * 1024;

#[repr(C)]
struct DataBlob {
    cb_data: u32,
    pb_data: *mut u8,
}

#[link(name = "Crypt32")]
extern "system" {
    fn CryptProtectData(
        input: *const DataBlob,
        description: *const u16,
        optional_entropy: *const DataBlob,
        reserved: *mut c_void,
        prompt: *const c_void,
        flags: u32,
        output: *mut DataBlob,
    ) -> i32;
    fn CryptUnprotectData(
        input: *const DataBlob,
        description: *mut *mut u16,
        optional_entropy: *const DataBlob,
        reserved: *mut c_void,
        prompt: *const c_void,
        flags: u32,
        output: *mut DataBlob,
    ) -> i32;
}

#[link(name = "Kernel32")]
extern "system" {
    fn LocalFree(handle: *mut c_void) -> *mut c_void;
}

/// Only native Rust receives unwrapped bytes. No Debug, Display, Serialize,
/// JS injection, filesystem path or frontend command is implemented.
pub(crate) struct DeviceSecret(Vec<u8>);

impl DeviceSecret {
    pub(crate) fn from_bytes(bytes: Vec<u8>) -> Result<Self, &'static str> {
        if bytes.is_empty() || bytes.len() > MAX_SECRET_SIZE {
            return Err("DPAPI_INVALID_SECRET_LENGTH");
        }
        Ok(Self(bytes))
    }
    pub(crate) fn bytes(&self) -> &[u8] {
        &self.0
    }
}

impl Drop for DeviceSecret {
    fn drop(&mut self) {
        // Volatile overwrite before the Vec deallocates its backing buffer.
        // This cannot erase copies created elsewhere or memory swapped to disk.
        for byte in self.0.iter_mut() {
            unsafe { write_volatile(byte, 0); }
        }
        compiler_fence(Ordering::SeqCst);
    }
}

/// Ciphertext only. Persist this in a per-user restricted directory when the
/// enrollment workflow exists; do not persist cleartext or master keys.
pub(crate) struct SealedDeviceSecret(Vec<u8>);

impl SealedDeviceSecret {
    pub(crate) fn from_ciphertext(bytes: Vec<u8>) -> Result<Self, &'static str> {
        if bytes.is_empty() || bytes.len() > MAX_DPAPI_BLOB {
            return Err("DPAPI_INVALID_CIPHERTEXT_LENGTH");
        }
        Ok(Self(bytes))
    }
    pub(crate) fn ciphertext(&self) -> &[u8] {
        &self.0
    }
}

/// Consume the OS-owned output exactly once, even when the API returned
/// an unexpected length. Zero OS plaintext buffers before LocalFree.
unsafe fn consume_output(out: &mut DataBlob, sensitive: bool) -> Result<Vec<u8>, &'static str> {
    if out.pb_data.is_null() || out.cb_data == 0 || out.cb_data as usize > MAX_DPAPI_BLOB {
        if !out.pb_data.is_null() {
            let _ = LocalFree(out.pb_data.cast::<c_void>());
        }
        out.pb_data = null_mut();
        return Err("DPAPI_UNEXPECTED_OUTPUT");
    }
    let len = out.cb_data as usize;
    let bytes = slice::from_raw_parts(out.pb_data, len).to_vec();
    if sensitive {
        for i in 0..len {
            write_volatile(out.pb_data.add(i), 0);
        }
        compiler_fence(Ordering::SeqCst);
    }
    let freed = LocalFree(out.pb_data.cast::<c_void>());
    out.pb_data = null_mut();
    if !freed.is_null() {
        return Err("DPAPI_FREE_FAILED");
    }
    Ok(bytes)
}

pub(crate) fn seal(secret: &DeviceSecret) -> Result<SealedDeviceSecret, &'static str> {
    if secret.bytes().is_empty() || secret.bytes().len() > MAX_SECRET_SIZE {
        return Err("DPAPI_INVALID_SECRET_LENGTH");
    }
    let input = DataBlob {
        cb_data: secret.bytes().len() as u32,
        pb_data: secret.bytes().as_ptr() as *mut u8,
    };
    let mut output = DataBlob {cb_data: 0, pb_data: null_mut()};
    let ok = unsafe {
        CryptProtectData(&input, null(), null(), null_mut(), null(), UI_FORBIDDEN, &mut output)
    };
    if ok == 0 {
        if !output.pb_data.is_null() {
            unsafe { let _ = LocalFree(output.pb_data.cast::<c_void>()); }
        }
        return Err("DPAPI_SEAL_FAILED");
    }
    let cipher = unsafe { consume_output(&mut output, false)? };
    SealedDeviceSecret::from_ciphertext(cipher)
}

pub(crate) fn unseal(sealed: &SealedDeviceSecret) -> Result<DeviceSecret, &'static str> {
    if sealed.ciphertext().is_empty() || sealed.ciphertext().len() > MAX_DPAPI_BLOB {
        return Err("DPAPI_INVALID_CIPHERTEXT_LENGTH");
    }
    let input = DataBlob {
        cb_data: sealed.ciphertext().len() as u32,
        pb_data: sealed.ciphertext().as_ptr() as *mut u8,
    };
    let mut output = DataBlob {cb_data: 0, pb_data: null_mut()};
    let ok = unsafe {
        CryptUnprotectData(&input, null_mut(), null(), null_mut(), null(), UI_FORBIDDEN, &mut output)
    };
    if ok == 0 {
        if !output.pb_data.is_null() {
            unsafe { let _ = LocalFree(output.pb_data.cast::<c_void>()); }
        }
        return Err("DPAPI_UNSEAL_FAILED");
    }
    let plaintext = unsafe { consume_output(&mut output, true)? };
    DeviceSecret::from_bytes(plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_seals_a_synthetic_secret_as_current_user() {
        let plaintext = DeviceSecret::from_bytes(
            b"FOON-W12-only-synthetic-credential-not-for-merchants".to_vec()
        ).unwrap();
        let cipher = seal(&plaintext).unwrap();
        assert_ne!(cipher.ciphertext(), plaintext.bytes());
        assert!(!cipher.ciphertext().windows(plaintext.bytes().len()).any(
            |window|window==plaintext.bytes()
        ));
        let decoded = unseal(&cipher).unwrap();
        assert_eq!(decoded.bytes(), plaintext.bytes());
    }

    #[test]
    fn malformed_ciphertext_is_rejected_without_returning_plaintext() {
        assert!(SealedDeviceSecret::from_ciphertext(Vec::new()).is_err());
        assert!(DeviceSecret::from_bytes(Vec::new()).is_err());
        let invalid = SealedDeviceSecret::from_ciphertext(vec![9; 50]).unwrap();
        assert!(unseal(&invalid).is_err());
    }

    #[test]
    fn tamper_of_ciphertext_fails_closed() {
        let credential = DeviceSecret::from_bytes(
            b"FOON-W12-sealed-credential-fixture".to_vec()
        ).unwrap();
        let sealed = seal(&credential).unwrap();
        let mut bytes = sealed.ciphertext().to_vec();
        let last = bytes.len()-1;
        bytes[last] ^= 0x80;
        let modified = SealedDeviceSecret::from_ciphertext(bytes).unwrap();
        assert!(unseal(&modified).is_err());
    }
}
