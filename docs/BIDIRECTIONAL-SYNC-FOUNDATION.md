# FOON two-way synchronization: foundation and release guard
Status: CONTRACT ONLY — NO ACTIVE SYNC (2026-10-22)
This work is on an isolated branch above Windows PR #205, not in cloud main.
## Target
All eligible business entities must eventually sync both directions, including categories, items, variants, media, translations, pricing, inventory movements, orders, bookings, tables, business settings and permitted customer references. Never sync passwords, card secrets, private customer keys, raw provider tokens or permission grants without separate server-side controls.
## Invariant
Event UUID for replay prevention; tenant/branch/actor scope checked server-side; per-entity optimistic version; cursor-scoped pull snapshots; durable outbox/inbox within business transactions; atomic idempotency ledger; conflict review; media via authenticated content-addressed uploads; local authorization and cloud revocation.
## What is implemented
`lib/platform/bidirectional-sync-contract.mjs` exports pure validation, optimistic conflict and digest/cursor primitives, with targeted unit tests. This is intentionally NOT a writable API endpoint, database journal, broad row replication or a live integration.
## Required before any activation
1. Design and migrate local/cloud change tables and per-device cursor, scoped by tenant, branch and partition. Plan safe initial snapshot and historic data matching.
2. Per-entity adapters & transaction-safe mutation hooks. Ordering/deletes, media upload, inventory movement and irreversible payments need specialized rules.
3. Authenticated push + pull endpoints: device registration, receipt signing, tenant RBAC/plan checks, 401/403/409 controls, no redirects, reject HTML/preview pages and unsafe transport.
4. Version-aware staging integration test including reconnection, races, duplicate replay, branch isolation, device revocation, compensation, offline age limits, read/write entitlement.
5. Hostinger preview redirect issue fixed and verified on staging. Keep operator's sync pause.
6. Source and signed Windows installer separated from Hostinger API updater distribution, backup/rollback policy reviewed.
No database or production change occurs from this branch until these gates are met.
