# FOON Windows W19 - native CNG SHA256 event-digest parity

## Purpose

Existing JavaScript `scripts/foon-edge-sync-contract.mjs` produces an event digest by SHA256 of JSON.stringify({seq,orderId,kind,payload}). It is unsafe to migrate this operation by simply serializing an unordered Rust map: JavaScript object insertion order may differ from Rust JSON map order and alter the digest. W19 keeps the exact previously serialized payload JSON bytes (serde_json::RawValue) and serializes the wrapper in explicit JavaScript field order.

## Changes

- Native Windows-only Rust file `src-tauri/src/native_event_digest.rs`, using Windows CNG SHA256 (unkeyed) and `serde_json` feature `raw_value` (no new direct crate dependency).
- Five native Rust tests: standard SHA256 known vector, created order event, status change event, UTF-8 Arabic text, malformed/oversized/noncanonical payloads.
- Five Node regression tests in `w19-native-event-digest-parity.test.mjs` pinning the native vectors to current `eventDigest` JavaScript behavior and verifying that the new Rust module cannot ACK or expose secrets in Tauri.
- A PowerShell 5.1 ASCII-only runner `run-w19-native-digest-tests.ps1`, using Node >=24, local cargo test, and W11 source-exposure audit.

## Parity vectors (synthetic only)

- Created order, seq 11: `2bf8b997b4161b8a3535364f3989439a14e0419d7ef90e1ac7ef2c298f7e092c`.
- Status change, seq 12: `1bee33364a8b066265ca555ec89f82bb7e46f44a277675037eb20e67d8fe5343`.
- Status with Arabic text, seq 13: `51f3d30997ae2dd4154e14de86755a30e2b52c5dbfd0c0e3f5859a358762c536`.

## Important limits

- These are synthetic, fixed parity vectors; this is NOT a proof of equivalence for arbitrary JSON payloads. The raw JSON must be canonical compact JSON created by a trusted local encoder and independently tied to the actual event saved in SQLite. The current legacy Node gateway still uses its original implementation.
- JavaScript numeric reformatting, exotic object keys, and legacy unknown event schemas need dedicated cross-language tests before the native code can authorize an Outbox ACK.
- SHA256 is an event-content checksum, not an authentication mechanism. A matching digest does not prove that the event is authorized. W18 receipt verification is separately required.
- There is NO actual native SQLite reader, no writing, no Outbox ACK, no production URL, no web endpoint, no key import or printer use. Nothing modifies the 3 W05/W06 synthetic orders or 12 pending events, or the W08/W10 local MariaDB fixtures.
- The old v0.1.4 NSIS still bundles readable Node scripts. W11 MUST block commercial distribution until a separate native gateway replacement and installer extraction audit pass.

## Windows test (once after obtaining this branch)

```powershell
Set-Location "$env:USERPROFILE\Desktop\FOON-Windows-W05"
git fetch origin feat/foon-windows-w19-native-event-digest-20261019
git switch --track origin/feat/foon-windows-w19-native-event-digest-20261019
& ".\apps\desktop\run-w19-native-digest-tests.ps1"
```

## Next safe step

Implement a read-only native Outbox query adapter against an entirely new temporary SQLite fixture, compare raw payload bytes/event order and event digest to the JavaScript implementation, then design a data-preserving migration for actual merchant databases. Do not read or modify W05/W06 until separately approved.

User-approved manual PR merge only, no GitHub Actions, no production deployment.
