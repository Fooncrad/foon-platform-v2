//! W26: native Windows ECDSA P-256 signed catalog verifier, test-only input.
//! A signing PRIVATE key must remain ONLY in the cloud. This code imports
//! public-key coordinates, validates scopes/revision/expiry, then verifies
//! a SHA256 ECDSA signature. No file I/O, network, DB, ACK, Tauri command.
//! Production must pin trusted cloud public keys and retrieve the prior
//! revision + time from trusted device storage/OS, NOT from a caller.
#![cfg(windows)]
#![allow(dead_code)]
use serde::{Deserialize,Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::ffi::c_void;
use std::ptr::{null,null_mut};
use crate::native_event_digest::sha256;

const MAX_DOCUMENT_BYTES:usize=32768;
const MAX_REVISION:u64=9_007_199_254_740_991;
const DOMAIN:&[u8]=b"FOON-CATALOG-V1\n";
const ECDSA_P256_PUBLIC_MAGIC:u32=0x31534345; // BCRYPT_ECDSA_PUBLIC_P256_MAGIC ("ECS1")

#[link(name="bcrypt")]
extern "system" {
    fn BCryptOpenAlgorithmProvider(h:*mut *mut c_void,alg:*const u16,implementation:*const u16,flags:u32)->i32;
    fn BCryptCloseAlgorithmProvider(h:*mut c_void,flags:u32)->i32;
    fn BCryptImportKeyPair(alg:*mut c_void,import_key:*mut c_void,blob_type:*const u16,
       key:*mut *mut c_void,input:*mut u8,size:u32,flags:u32)->i32;
    fn BCryptDestroyKey(h:*mut c_void)->i32;
    fn BCryptVerifySignature(key:*mut c_void,padding:*mut c_void,hash:*mut u8,
       hash_size:u32,signature:*mut u8,signature_size:u32,flags:u32)->i32;
}
struct Alg(*mut c_void);
impl Drop for Alg {
    fn drop(&mut self){if !self.0.is_null(){unsafe{let _=BCryptCloseAlgorithmProvider(self.0,0);}}}
}
struct Key(*mut c_void);
impl Drop for Key {
    fn drop(&mut self){if !self.0.is_null(){unsafe{let _=BCryptDestroyKey(self.0);}}}
}
fn parse_lower_hex<const N:usize>(s:&str)->Option<[u8;N]>{
    if s.len()!=2*N{return None;}
    let mut out=[0u8;N];
    for (i,target) in out.iter_mut().enumerate() {
        let digit=|b:u8|match b{b'0'..=b'9'=>Some(b-b'0'),b'a'..=b'f'=>Some(b-b'a'+10),_=>None};
        *target=(digit(s.as_bytes()[2*i])?<<4)|digit(s.as_bytes()[2*i+1])?;
    }
    Some(out)
}
fn identifier(s:&str)->bool{
    !s.is_empty()&&s.len()<=128&&s.is_ascii()&&
      s.bytes().all(|b|b.is_ascii_alphanumeric()||b"-_.".contains(&b))
}
#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Item {
    id:String,unit_cents:u64,currency:String,enabled:bool,stock_qty:u64
}
#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Snapshot {
    revision:u64,tenant_id:String,branch_id:String,
    issued_at:u64,expires_at:u64,items:Vec<Item>
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SignedSnapshot {
    snapshot:Snapshot,
    signature:String
}
pub(crate) struct ExpectedCatalog<'a>{
    pub(crate) tenant_id:&'a str,
    pub(crate) branch_id:&'a str,
    pub(crate) previous_revision:u64,
    // Test runner chooses a fixed timestamp; real callers must use secure OS time.
    pub(crate) now_epoch:u64
}
#[derive(Debug,PartialEq,Eq)]
pub(crate) struct CatalogProof {
    pub(crate) revision:u64,
    pub(crate) item_count:usize
}
fn verify_cng_p256(public_xy:&[u8;64], digest:&[u8;32],signature:&[u8;64])->bool{
    let algorithm:Vec<u16>="ECDSA_P256".encode_utf16().chain(Some(0)).collect();
    let blob_type:Vec<u16>="ECCPUBLICBLOB".encode_utf16().chain(Some(0)).collect();
    let mut provider=Alg(null_mut());
    if unsafe{BCryptOpenAlgorithmProvider(&mut provider.0,algorithm.as_ptr(),null(),0)}<0
       ||provider.0.is_null(){return false;}
    let mut blob=[0u8;72];
    blob[..4].copy_from_slice(&ECDSA_P256_PUBLIC_MAGIC.to_le_bytes());
    blob[4..8].copy_from_slice(&32u32.to_le_bytes());
    blob[8..].copy_from_slice(public_xy);
    let mut key=Key(null_mut());
    if unsafe{BCryptImportKeyPair(provider.0,null_mut(),blob_type.as_ptr(),&mut key.0,
         blob.as_mut_ptr(),blob.len() as u32,0)}<0||key.0.is_null(){
       return false;
    }
    // SHA256 digest and IEEE P1363 signature layout (r||s), each 32 bytes.
    unsafe{BCryptVerifySignature(key.0,null_mut(),digest.as_ptr() as *mut u8,
      digest.len() as u32,signature.as_ptr() as *mut u8,
      signature.len() as u32,0)}>=0
}
fn canonical(snapshot:&Snapshot)->Result<Vec<u8>,&'static str>{
    // Explicit arrays eliminate serde_json object-map vs JS key-order drift.
    let rows:Vec<(&str,u64,&str,bool,u64)>=snapshot.items.iter().map(|item|
      (item.id.as_str(),item.unit_cents,item.currency.as_str(),item.enabled,item.stock_qty)
    ).collect();
    let json=serde_json::to_vec(&(
      snapshot.revision,snapshot.tenant_id.as_str(),
      snapshot.branch_id.as_str(),snapshot.issued_at,
      snapshot.expires_at,rows
    )).map_err(|_|"W26_CANONICAL_FAILED")?;
    let mut payload=Vec::with_capacity(DOMAIN.len()+json.len());
    payload.extend_from_slice(DOMAIN);
    payload.extend_from_slice(&json);
    Ok(payload)
}
fn validate(snapshot:&Snapshot,expected:&ExpectedCatalog<'_>)->Result<(),&'static str>{
    if !identifier(expected.tenant_id)||!identifier(expected.branch_id)||
       snapshot.tenant_id!=expected.tenant_id||snapshot.branch_id!=expected.branch_id{
       return Err("W26_SCOPE_REJECTED");
    }
    if snapshot.revision==0||snapshot.revision>MAX_REVISION||
       snapshot.revision<=expected.previous_revision{
       return Err("W26_REPLAY_OR_REVISION_REJECTED");
    }
    if snapshot.issued_at>expected.now_epoch||
       snapshot.expires_at<=expected.now_epoch||
       snapshot.expires_at<=snapshot.issued_at||
       snapshot.expires_at-snapshot.issued_at>604800{
       return Err("W26_EXPIRY_OR_CLOCK_REJECTED");
    }
    if snapshot.items.is_empty()||snapshot.items.len()>1000{
       return Err("W26_ITEMS_REJECTED");
    }
    let mut seen=HashSet::new();
    for item in &snapshot.items{
        if !identifier(&item.id)||!seen.insert(item.id.as_str())||
           item.unit_cents>1_000_000_000||item.stock_qty>1_000_000_000||
           item.currency.len()!=3||
           !item.currency.bytes().all(|c|c.is_ascii_uppercase()){
            return Err("W26_ITEMS_REJECTED");
        }
    }
    Ok(())
}
pub(crate) fn verify_signed_catalog(
    bytes:&[u8],
    trusted_public_xy:&[u8;64],
    expected:ExpectedCatalog<'_>
)->Result<CatalogProof,&'static str>{
    if bytes.is_empty()||bytes.len()>MAX_DOCUMENT_BYTES{
        return Err("W26_DOCUMENT_TOO_LARGE_OR_EMPTY");
    }
    let signed:SignedSnapshot=serde_json::from_slice(bytes)
        .map_err(|_|"W26_SCHEMA_REJECTED")?;
    validate(&signed.snapshot,&expected)?;
    let sig=parse_lower_hex::<64>(&signed.signature)
        .ok_or("W26_SIGNATURE_FORMAT_REJECTED")?;
    let canonical=canonical(&signed.snapshot)?;
    let digest=sha256(&canonical).map_err(|_|"W26_NATIVE_SHA256_UNAVAILABLE")?;
    if !verify_cng_p256(trusted_public_xy,&digest,&sig){
        return Err("W26_SIGNATURE_INVALID");
    }
    Ok(CatalogProof{
       revision:signed.snapshot.revision,item_count:signed.snapshot.items.len()
    })
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn malformed_or_unscoped_signed_catalog_never_passes(){
        let public=[0u8;64];
        let scope=ExpectedCatalog{
            tenant_id:"tenant-fixture-w26",branch_id:"branch-fixture-w26",
            previous_revision:6,now_epoch:1_800_000_000
        };
        assert!(verify_signed_catalog(b"{}",&public,scope).is_err());
        assert!(parse_lower_hex::<64>(&"f".repeat(128)).is_some());
        assert!(parse_lower_hex::<64>(&"F".repeat(128)).is_none());
        assert!(parse_lower_hex::<64>("0").is_none());
    }
    #[test]
    #[ignore="W26 needs one newly signed ephemeral asymmetric test case"]
    fn synthetic_signed_catalog_signature_case(){
        let doc=std::env::var("FOON_W26_SIGNED_DOCUMENT")
            .expect("W26_SIGNED_DOCUMENT_REQUIRED");
        let xy=std::env::var("FOON_W26_TEST_PUBLIC_XY")
            .expect("W26_EPHEMERAL_PUBLIC_KEY_REQUIRED");
        let public=parse_lower_hex::<64>(&xy)
            .expect("W26_INVALID_EPHEMERAL_PUBLIC_KEY");
        let scenario=std::env::var("FOON_W26_CASE")
            .expect("W26_SYNTHETIC_CASE_REQUIRED");
        let mut expected=ExpectedCatalog{
           tenant_id:"tenant-fixture-w26",branch_id:"branch-fixture-w26",
           previous_revision:6,now_epoch:1_800_000_000
        };
        if scenario=="wrong-expected-tenant"{expected.tenant_id="other-tenant";}
        if scenario=="wrong-expected-branch"{expected.branch_id="other-branch";}
        if scenario=="stale-revision"{expected.previous_revision=7;}
        let result=verify_signed_catalog(doc.as_bytes(),&public,expected);
        if scenario=="valid"{
            assert_eq!(result.unwrap(),CatalogProof{revision:7,item_count:2});
        }else{
            assert!(result.is_err(),"W26 must reject scenario {scenario}");
        }
    }
}
