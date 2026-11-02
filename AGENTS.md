# FOON V2 — Mandatory agent onboarding and safety rules

> **STOP: Read this file before making any code, database, deployment, or infrastructure changes.**
> These instructions apply to every coding agent and automation working anywhere in this repository.

## 1. Understand the project first
FOON V2 is a multi-tenant SaaS for restaurants, stores, and service businesses. Core modules include platform administration, store/branch administration, multilingual QR menus, POS, KDS, orders, tables, reservations, waitlists, waiter calls, customers and loyalty, notifications/email, subscriptions, billing, and payments. Arabic RTL is the default; English and French are supported. Mobile usability, stable layouts, and strict tenant/branch separation are mandatory.

**Read before editing:** `README.md`, `package.json`, relevant `app/` routes, `lib/` services, `migrations/`, `.github/workflows/`, and `scripts/FOON-EDGE-SYNC.md` when touching offline sync. Check current `main` commits, open changes, CI results, and the relevant tests. Do not infer functionality merely from filenames or earlier reports. Verify the actual code.

## 2. Current priority: reliable offline-first operation
Finish the existing offline/sync architecture **before** beginning printer hardware or FOON Connect work:
- Trusted local Node gateway with SQLite, durable event/outbox storage, recovery after restart.
- Cloud ingestion into MySQL with authenticated device identity, tenant/branch/role authorization, idempotency, transactional business mutations, and signed receipts.
- Never ACK local events without verifying the matching durable cloud receipt.
- Offline POS/KDS/menu workflows and explicit pending/retry/conflict/synced states.
- Test disconnect/reconnect, duplicate delivery, ACK loss, concurrent changes, crash/restart, and data integrity.
- Existing simulated-cloud tests are **not** proof of production-ready MySQL integration.
- Offline card payments require a certified provider workflow; never improvise them.

## 3. Safety invariants
- **Never** delete, reset, migrate, or mutate production data without explicit authorization, verified backups, and a reviewed migration plan. No destructive operations.
- Never deploy to Hostinger or claim deployment unless the actual publish and health checks are confirmed. Do not deploy failed builds.
- No secret tokens, signing keys, database credentials, customer personal data, or private logs in source, tests, commits, or responses.
- Validate authentication and authorization server-side. Staff must not be silently granted customer or super-admin privileges.
- Enforce tenant and branch ownership on every read/write; fail closed when identity or permission checks fail.
- Use transactions and idempotency for orders, billing, payment, and sync; never report success before persistence is confirmed.
- Keep mobile layouts stable (including 320px widths), prevent horizontal overflow, respect RTL/LTR, and use Latin digits for numeric/date/time inputs.
- Maintain compatibility with the existing schema and migration ordering; do not assume a table exists just because a migration file exists.

## 4. Workflow for every task
1. Inspect relevant source and latest GitHub Actions; identify a reproducible root cause.
2. Choose the smallest safe change; state what it affects and what it must not affect.
3. Add or update regression tests, especially authorization, tenant isolation, replay, and failure cases.
4. Run applicable unit/integration tests, type checks, build, and CI. If tooling cannot run them, say so explicitly.
5. Commit with a descriptive message and link the exact commit. Confirm CI on that commit, not an older one.
6. Report in Arabic: inspected scope, actual changes, test/build/deployment results (confirmed vs pending), remaining risks ranked by priority, and next step.
7. Never fabricate successful tests, publication, completion percentages, or production readiness.

## 5. Scope and collaboration
- Prefer focused, reversible commits; preserve existing user work and do not rewrite unrelated modules.
- Do not blindly copy legacy repositories; inspect and adapt patterns to this architecture.
- Respect current user priorities over older plans. Do not start background recurring work unless explicitly scheduled.
- For a request to continue, do a concrete review, test, or safe incremental improvement rather than repeating a generic plan.
- If a tool or permission blocks progress, describe the precise blocker and leave production untouched.

**Repository:** `Fooncrad/foon-platform-v2`. The actively inspected development branch is `main`; check branch protection and actual deployment configuration before any release. The README may mention a separate production branch: do not assume `main` is automatically production.
