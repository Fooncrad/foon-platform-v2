# FOON W16 — Offline print event integration (test-only)

**5/5 tests passed** on local Node 22.16.0. Exact SHA-1 git blobs matched the committed coordinator and test source. No real printer or merchant data accessed.

## What is exercised

- Accept a server/native trusted synthetic merchant order and obtain category-level printer tickets via W14.
- Persist separated tickets atomically in the W15 WAL print outbox, replay the same event without new tickets and resume after a process restart.
- Generate independent merchant customer receipts and platform-admin subscription invoices, never cross-printing between roles.
- A fake spooler success moves a job to `printed`; an ambiguous failure moves it to `unknown`, blocking silent auto-reprint until explicit review.
- Reject foreign branches, unassigned categories and mis-scoped admin printers before creating any queue entry.
- Queue summary hides ticket bodies, claim tokens and user content.

## Critical boundaries

W16 is a **test harness**, not a physical Windows printer driver or final POS/KDS integration. Its synthetic driver callback is deliberately injected, and the W15 database path is restricted to a disposable `foon-w15-print-*` directory under the OS temp folder. It MUST NOT be bundled into customer installers as clear-text JS. W11 commercial release remains blocked.

## Next steps

1. Owner/manager authorization and printer assignments stored per tenant/branch/activity in the real merchant backend.
2. Native Rust Windows spooler integration and printer status with no plaintext backend source in NSIS.
3. Dedicated durable and protected local queue plus operator-review UI, with audit trails and no hidden retries after uncertain physical output.
4. Real Windows printer/kitchen/customer/admin invoice acceptance, powered off/restored/offline stress tests, compliant invoice templates.
5. Manual approval and production rollout. W05/W06 persistent SQLite (3 orders, 12 pending) and W08/W10 local MariaDB synthetic fixtures remain untouched.

All stages remain isolated feature branches and draft PRs. No GitHub Actions, auto merge, release or Hostinger deployment.
