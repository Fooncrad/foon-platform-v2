# FOON Windows W25 — native synthetic catalog, stock and pricing gate

## Proven baseline

W24 passed on Windows: 20/20 Node security tests, 2/2 native targeted Rust tests (one disposable-data case deliberately ignored in the default pass), `cargo check --offline --lib --features native-probe`, and all 7 real synthetic SQLite WAL commit/rollback/scope cases. W11 correctly continues to BLOCK the legacy commercial installer because readable Node backend files remain.

## W25 changes

- Introduces an **opt-in** `create_synthetic_order_with_catalog_atomic` in the existing native Rust transaction module. The original W24 entry point remains unchanged to avoid invalidating prior compatibility tests.
- Uses a **synthetic per-tenant/per-branch catalog** table inside a newly created OS-temp SQLite fixture only. This is NOT yet a signed server catalog or authoritative merchant inventory.
- Refuses missing/disabled products, mismatched user-provided `expectedUnitCents` or `expectedCurrency`, insufficient quantity, wrong tenant or device, duplicate items, zero/non-integer/oversized quantities, extra item properties and malformed currency.
- Crucially, `UPDATE synthetic_catalog SET stock_qty=stock_qty-? ...` is restricted by tenant+branch+item+trusted price+currency+enabled+stock and executes **inside the SAME `BEGIN IMMEDIATE`** as `orders`, `events` and `outbox` creation. A failed later item or injected failure causes full SQLite `ROLLBACK` including the stock reservation.
- A repeated order ID is rejected before reserving stock, preventing a duplicate reservation in the synthetic test.
- All query values are parameter-bound using WinSQLite3, and the native connection enforces `foreign_keys=ON`, `synchronous=FULL` and `busy_timeout=5000`.
- No new WebView/Tauri command, backend HTTP endpoint, receipt ACK or ability to open a real W05/W06 database.

## Windows acceptance

`w25-native-catalog-acceptance.mjs` creates **13 different freshly generated** `FOON-W24-Fixture-<UUID>/orders.sqlite` files in OS Temp. Test cases: success, injected rollback after catalog, changed price, item missing, item disabled, stock short, wrong currency, zero quantity, duplicated item, forbidden extra field, mixed multi-item rollback, wrong tenant, wrong device. JS reopens its own synthetic fixture and confirms that only success produces exactly one saved order, one created event, one pending Outbox and the correct stock decrement; all other cases must match the original DB rows exactly.

`w25-native-catalog-safety.test.mjs` provides six static source safety checks. `run-w25-native-catalog-acceptance.ps1` also repeats the seven **isolated** W24 transaction cases and W23 source security regressions before checking W11's expected commercial blocker. It does not rerun W08/W10 MariaDB writers or any other historical one-time setup.

```powershell
cd "$env:USERPROFILE\Desktop\FOON-Windows-W05"
git fetch origin feat/foon-windows-w25-native-catalog-stock-20261019
git switch --track origin/feat/foon-windows-w25-native-catalog-stock-20261019
& ".\apps\desktop\run-w25-native-catalog-acceptance.ps1"
```

**The W25 Windows Rust and live synthetic SQLite tests have NOT yet been run.** Source readback and structural assertions were reviewed, but Windows is needed to prove compile and runtime behavior.

## Production boundaries

- This fixture catalog is not an independently signed, leased, versioned or server-authorized snapshot. Real merchant prices, stock, tax, branch settings and item availability must be synchronized from a trusted central source, with expiry/conflict rules for offline operation.
- Multi-device stock reservations need reconciliation and offline overselling policy. W25 guarantees only the **one local SQLite transaction** in the synthetic fixture, not global inventory availability across stores/devices.
- Full native device enrollment, real merchant SQLite migration and backup/restore, native cashier UI, cloud signed ACK and physical printers are not enabled by W25.
- Do not touch saved W05/W06 orders or pending Outbox events, W08/W10 MariaDB fixtures, Hostinger or production deployments. Do not merge automatically or rely on GitHub Actions.
- The customer-facing legacy commercial NSIS remains blocked under W11. The separate W23 non-POS probe having passed its extracted-file audit does not imply a full POS release.
