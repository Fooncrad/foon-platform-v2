# FOON Windows W17 - native signed-receipt verification (migration step)

## Scope

W17 ports the receipt identity/scope checks and HMAC-SHA256 signature verification from an extractable JavaScript module into a **native Windows-only Rust component**, using Windows CNG BCrypt instead of introducing new Rust crypto dependencies. This is an isolated migration step, NOT the replacement of the legacy SQLite gateway.

New Rust module: `apps/desktop/src-tauri/src/native_cloud_receipt.rs`.
New Node compatibility/static tests: `apps/desktop/w17-native-receipt-parity.test.mjs`.
Single Windows runner: `apps/desktop/run-w17-native-receipt-tests.ps1`.

## Security properties

- Requires exact expected device ID, order ID, local event sequence and SHA-256 event digest; checks the signed cloud receipt before any eventual ACK.
- Strict lowercase 64-character hex HMAC, bounded ASCII identifiers, signed JSON canonicalized in the same field order as the current JS receipt contract.
- Uses Windows CNG SHA256 HMAC and a constant-time comparison. Synthetic cross-language known-answer test pinned to `e1710acbf388b694869530f7625fba261a49f6130ed678420049e74beca594db`.
- No Tauri command or exposed JavaScript API; no gateway secrets, production DB, user Windows credential, local DB write, listener, internet request or print output.
- A future enrolled **per-device** verifier key could be unwrapped by the native W12 DPAPI component and passed only in Rust memory. Production server master signing keys must NEVER be shipped to the desktop.

## Current limitations (required reading)

- No Windows Rust results yet: CNG and HMAC execution must be verified on the user's Windows machine. Only the independent synthetic Node/Python HMAC calculation was verified during development.
- W17 is compiled but **not wired** into the real Node SQLite engine or Outbox acknowledgement; no previous event is ACKed and no existing customer data touched.
- W17 does not remove `scripts/foon-lan-sqlite.mjs`, the JS contract, or the receipt-signature module from the legacy v0.1.4 NSIS resources. **W11 commercial distribution MUST remain blocked.**
- The native code is still susceptible to reverse engineering; it removes readable source when ultimately replacing the JS path, but cannot make a client executable impossible to inspect.
- W05/W06 3 local synthetic orders and 12 pending Outbox events, W08 original data and W10 fixture rows remain untouched.
- The repository visibility must be set to Private by the owner. Until then source files can still be retrieved via GitHub independent of packaging.

## Test on Windows

```powershell
Set-Location "$env:USERPROFILE\Desktop\FOON-Windows-W05"
git fetch origin feat/foon-windows-w17-native-receipt-verifier-20261019
git switch --track origin/feat/foon-windows-w17-native-receipt-verifier-20261019
& ".\apps\desktop\run-w17-native-receipt-tests.ps1"
```

## Next implementation

1. Validate native CNG behavior and test signatures against Node and the current server after Windows tests.
2. Port remaining event digest verification, order transition policy and local gateway business logic to Rust behind an isolated adapter.
3. Move SQLite WAL / Outbox into a native Rust service, preserving existing schema and recovery semantics; create migration/rollback and data-integrity test plans BEFORE operating on persistent W05/W06 SQLite.
4. Wire native receipt verification only after device enrollment/DPAPI and signed server authorization exist, and test no ACK on tampering or lost connection.
5. Remove text backend scripts and signing helpers from distribution resources, rerun W11 after a dry-run NSIS build, and separately inspect the final installer contents.
6. Keep separate merchant/customer/platform-printer roles and W15 uncertain-print review. Then Windows packaging/signing/installer QA and **manual PR approval**.

No GitHub Actions, production deployment, automatic merge or one-time W08/W10 DB writer reruns.
