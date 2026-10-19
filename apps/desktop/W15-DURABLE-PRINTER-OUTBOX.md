# W15 — Durable printer outbox, isolated SQLite WAL proof

**Validation:** 9/9 Node tests passed on Node 22.16.0 locally; exact Git blob SHA verified for source and tests. The module is STRICTLY test-only: it accepts only a single `print-jobs.sqlite` file inside a fresh `foon-w15-print-*` child of the system temporary folder. It cannot open W05/W06 durable SQLite or merchant data paths.

## Local semantics

- Route via W14's trusted `category → printer` mapping, then enqueue section tickets, customer receipts and platform subscription invoices as distinct deterministic job IDs.
- `enqueue` runs in a SQLite BEGIN IMMEDIATE transaction and refuses a changed payload replay or a duplicate job ID in the same batch.
- The `pending → leased → dispatching → printed` state machine enforces an exclusive claim token per attempt.
- A crash after `dispatching` may have physically printed paper. On next open this job becomes **unknown** and is NOT automatically retried. Only a privileged operator's explicit external authorization + `manualReview` can mark it printed or confirm no paper came out and return to pending.
- A lease that expired **before** `beginDispatch` is eligible for safe re-claim. A returned spooler failure after dispatch is ambiguous and must be moved to `unknown`.
- Job metadata hides payload text; no customer notes/tokens are logged. WAL persists job states over a restart.

## Hard limitations (do not call it a finished printer)

- No physical Windows spooler API, printer discovery, device driver, KDS, barcode, Arabic thermal templates, remote backend write, or production synchronization.
- The queue's `manualReview` takes an operatorId string, but **does not perform authentication**; the eventual native service must authorize owner/manager/staff grants before calling it and must audit identities reliably.
- Job IDs deduplicate enqueue only; physical exactly-once printing is impossible to guarantee on arbitrary printers after an interrupted output.
- Only synthetic fixture payloads. No payment or compliant fiscal invoice is generated.
- W11 release gate still blocks commercial delivery because current runtime bundles readable backend MJS files. Do not bundle this test-only JS queue in NSIS.

## Local tests (no MariaDB writes)

```powershell
cd "$env:USERPROFILE\Desktop\FOON-Windows-W05"
git fetch origin feat/foon-windows-w15-durable-print-outbox-20261019
git switch --track origin/feat/foon-windows-w15-durable-print-outbox-20261019
& ".\apps\desktop\run-w15-print-tests.ps1"
```

This does not rerun one-time W08/W10 MariaDB tests and never opens W05/W06 3 synthetic orders / 12 pending events. No GitHub Actions, merge, installer or production access.

## Next gates

Native Rust print worker integrated with a dedicated durable queue location and Windows OS security; role-based manual reprint review; real printer hardware; actual Windows restart/crash testing; secure installation & signature; private source repository and user-approved rollout.
