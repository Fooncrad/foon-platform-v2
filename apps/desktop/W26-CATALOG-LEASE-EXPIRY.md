# FOON Windows W26 — scoped offline catalog lease expiry (isolated prototype)

## Verified starting point

The user's Windows W25 output ended with `W25 ISOLATED TESTS COMPLETE` and W11's expected commercial source-exposure block. Earlier W24 and W23 tests passed. These are still synthetic, not production installations.

## W26 change

- Adds a third, **opt-in**, Windows-native Rust order writer entry point `create_synthetic_order_with_catalog_lease_atomic`, while the W24 and W25 methods retain their previous behavior.
- Before subtracting synthetic catalog stock, the new path checks a synthetic `synthetic_catalog_lease` row inside the SAME `BEGIN IMMEDIATE` transaction. It must match the tenant, branch, device and expected revision; be enabled; have started by the current native Windows epoch time; not be expired; and have a strictly positive lease length of at most 86,400 seconds (24 hours).
- An expired, future-issued, missing, disabled, overlong, wrong-revision, wrong-device, wrong-branch or wrong-tenant lease fails CLOSED with no order/event/Outbox writes and no stock decrement.
- W26 obtains the current UNIX time from native Rust `SystemTime::now()` and never from the browser, order payload or a test-provided clock argument.
- This check takes place under the same SQLite transaction as the W25 stock reservation and W24 order/event/Outbox writes. A later injected rollback undoes the stock decrement.

## Test coverage

`w26-catalog-lease-adversarial.mjs` creates eleven different disposable SQLite WAL fixture directories in OS Temp, with temporary scope locks, catalog rows and synthetic lease metadata. Its acceptance cases are: success, rollback after catalog, expired lease, not-yet-issued lease, wrong revision, disabled lease, missing lease, duration over 24 hours, wrong tenant, wrong branch and wrong device.

For the rejection cases, the runner compares ALL order, event, Outbox, stock and lease rows before and after the native attempt. It also verifies that the unrelated synthetic tenant stock does not change during success.

`w26-catalog-lease-safety.test.mjs` adds seven pure source-level security regressions; `run-w26-native-catalog-lease.ps1` runs those and W23–W25 Node safety checks, tests the native Rust module, checks the native-only W23 build feature, reruns W24 (7 cases) and W25 (13 cases) on freshly created synthetic SQLite databases, then runs W26 (11 cases) and expects W11 commercial release to remain blocked.

## Critical limitations

**This local synthetic lease is NOT cryptographically signed or server-authorized.** Anybody able to alter the test SQLite content or manipulate the OS clock could potentially make local metadata appear valid. This phase only establishes a fail-closed local expiry/revision mechanism for use behind a future stronger trust boundary.

Before any real merchant order, implement server-signed and independently verifiable catalog snapshots, key rotation and revocation, anti-rollback/clock skew policy, authoritative tenant/device enrollment, and conflict reconciliation across offline terminals. A local 24-hour lease cannot ensure that stock or pricing remains current when multiple devices are offline.

W26 has not yet been compiled or tested on the user's Windows system. Only GitHub source readback and structural checks were possible during authoring.

The W05/W06 saved SQLite containing three synthetic orders and twelve pending Outbox events, W08/W10 local MariaDB and any real merchant inventory remain untouched. No cloud access, live payment, printer, deployment, CI, PR merge or real ACK is authorized. The old commercial NSIS still fails W11 because it bundles readable Node backend source; W23 separate source-safe probe is not a usable POS.

## Run the next Windows check

```powershell
cd "$env:USERPROFILE\Desktop\FOON-Windows-W05"
git fetch origin feat/foon-windows-w26-catalog-lease-expiry-20261019
git switch --track origin/feat/foon-windows-w26-catalog-lease-expiry-20261019
& ".\apps\desktop\run-w26-native-catalog-lease.ps1"
```

Do not rerun the one-time MariaDB writers (W08/W10), merge any stacked PR automatically, trigger GitHub Actions or deploy production.
