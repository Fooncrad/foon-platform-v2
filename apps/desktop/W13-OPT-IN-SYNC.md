# FOON Windows W13 — Opt-in sync retry scheduler (isolated core)

**Status:** Pure lifecycle module with 7/7 tests passed on Node 22 (Linux). NOT connected to the installed Windows POS, NOT an auto-start job, NOT a real cloud deployment.

## New source

- scripts/foon-edge-sync-scheduler.mjs: Pure injected batch runner. Importing/constructing it does not create any timer, read a DB, open a network socket or expose tokens.
- scripts/foon-edge-sync-scheduler.test.mjs: Seven tests for explicit lifecycle, single-flight behavior, retry/backoff, conflict suspension, stale stop/start results, malformed responses.
- Does not change the original sync bridge, SQLite gateway, production Next.js, W05/W06 data, or W08/W10 MariaDB fixtures.

## Workflow

1. After trusted native device enrollment, an authorized native-only caller can inject a runBatch function invoking syncLocalOutbox with scoped credentials and verified receipts.
2. start() must be called explicitly by the authenticated native service. No import-time side effects.
3. Failed attempts wait 2x, 4x and so on up to the configured maximum. No concurrent duplicate batches.
4. Business conflicts suspend attempts until explicit resumeAfterReview() by an authorized operator.
5. stop() cancels future timers, NOT a request already sent. Cooperative cancellation of in-flight fetch/ACK needs separate native integration.
6. Status reports only counters and coarse state; never tokens, URLs, device IDs or order payloads.

## Remaining

- W12 real native device enrollment and Windows protected credential persistence.
- Expiration, revocation, tenant/branch scoping and server audit.
- Native adapter wiring without secrets in WebView, signed ACK and operator controls.
- Windows service/reboot/offline/reconnect acceptance and Next.js staging HTTPS integration.
- Explicit manual rollout approval after independent test and review.

Do NOT rerun one-time W08/W10 DB writers. No GitHub Actions, merge or deployment.
