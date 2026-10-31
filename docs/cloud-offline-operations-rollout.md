# Cloud offline operations rollout

Scope: the hosted FOON V2 application in `Fooncrad/foon-platform-v2`, based directly on `main`. This document does not authorize Windows-client changes, production edits, merges, or deployments.

## Verified baseline

- The cloud POS workspace currently refuses to create a cloud POS order while `navigator.onLine` is false. It directs operators to the separate encrypted local POS page.
- The separate local POS page stores its catalog/profile and pending orders in IndexedDB encrypted with PBKDF2-derived AES-GCM keys, scoped to the authenticated user, tenant, and branch. It re-authenticates online before syncing.
- The local POS page currently accepts only simple, unmeasured items without variants/options. Its offline order channels are limited to takeaway and dine-in. It deliberately excludes customer contact data, coupons, notes, and manual payment claims.
- The server-side order creation path re-reads catalog prices and options, checks tenant/branch scope, validates activity profile/currency/channel, applies inventory debits and checkout totals, and supports a request key plus request fingerprint for idempotent retries.
- The service worker keeps authenticated dashboard navigation network-only and does not cache API responses or private SSR/RSC pages. This boundary must remain in place.

## Delivery schedule

1. **Baseline and contracts** — inspect every cloud POS entry point, activity route, API authorization path, and offline browser test. Record the supported/unsupported order shapes before changing behavior.
2. **Shared encrypted queue contract** — define an activity-neutral encrypted queue record with tenant, branch, user, activity, stable request key, payload version, creation time, and explicit pending/review/acknowledged states. Never store customer PII or payment credentials in plaintext.
3. **Activity-aware local checkout** — support only order types and catalog shapes that can be safely reconstructed offline. Keep unsupported variants, measurements, reservations, delivery assignment, coupons, and payment operations online-only until their full validation paths are implemented.
4. **Safe replay** — replay through the existing authenticated server API; re-check current membership, employee grants, branch assignment, activity entitlement, item availability, variants, price, tax, stock, and channel rules. Use the stable request key/fingerprint to make retries idempotent. Retain network failures; move deterministic validation failures to manual review.
5. **Recovery and conflict tests** — cover browser reload, account/tenant/branch switching, expired local authorization, duplicate replay, concurrent tabs, changed price/stock, partial failure, backup/restore, and service-worker privacy boundaries.
6. **Review handoff** — run focused tests and the relevant build/type checks where available, inspect the complete branch diff, ensure no Windows paths are present, then open a PR directly to `main`. Do not merge or deploy.

## Non-negotiable safety rules

- Offline acceptance means “saved encrypted on this device”; it does not mean the cloud has received or processed the order.
- The server remains authoritative. Cached prices, stock, tables, tax, employee permissions, and activity entitlements are advisory only.
- Do not cache authenticated HTML, dashboards, RSC payloads, API responses, customer records, or staff records in the service worker.
- A server acknowledgement is terminal for that queue item. Never resurrect it from a retry or backup.
- Fail closed when identity, tenant, branch, permissions, encryption, or local authorization cannot be verified.

## Second-pass implementation audit (2026-10-30)

### What the current cloud code already supports

- The authenticated POS read endpoint is activity-aware: `salesProfile` selects the legacy restaurant menu for restaurant tenants and the shared catalog for supported non-restaurant activities. `activityPosMenu` returns enabled, branch-scoped catalog products (up to 1,000) and their current price, stock, measurement policy, and variant metadata.
- The encrypted local POS profile is bound to the authenticated user, tenant, and branch. It uses PBKDF2 (310,000 iterations) to derive an AES-GCM key, expires after eight hours, and locks after fifteen minutes of inactivity.
- The local queue accepts only simple active items with a valid non-negative price. It deliberately excludes measured items, variants, and option groups. Its supported channels are only `takeaway` and `dine_in`; dine-in additionally requires a cached available table and capacity check.
- Replay re-authenticates the same user and branch, uses an exclusive Web Lock, posts through the existing authenticated POS API, and relies on the server request key/fingerprint for idempotency. Network failures retain the encrypted queue item; deterministic server rejections are retained as `needs_review`.
- The server remains authoritative for current tenant membership, branch and employee permissions, activity profile, catalog availability, price/currency, variants/options, stock, channel policy, tax/checkout totals, and request-key conflicts.
- The service worker caches only the data-free offline shell and explicitly saved public menu pages/images. Authenticated dashboards, private HTML/RSC, and API responses remain network-only.

### Verified gaps — do not describe these as completed

- The hosted POS workspace itself still refuses to create an order while offline. It directs the operator to the separate encrypted local POS page.
- The local POS page is a constrained fallback, not full parity with the online POS. It cannot accept measured products, variants/options, customer details, notes, coupons, manual payments, reservations, delivery assignment, or pickup-point selection.
- Although the shared catalog endpoint can read products for non-restaurant activities, the offline queue still submits through the generic order/POS workflow. This does not implement offline service-order lifecycles for car wash, laundry, salons, vehicle services, or contracting, and it does not prove every activity's channels and plan entitlements are compatible.
- The offline profile currently does not persist an explicit activity code/capability contract. A future shared queue must bind the activity and payload version, and the server must reject a replay if the tenant's activity or supported order contract has changed.
- The existing plaintext `lib/restaurant/offline-pos.ts` queue is not an acceptable substitute for the encrypted local queue for new customer/staff data.

### Remaining implementation work

1. Build dedicated offline-safe service-order contracts for carwash, laundry, automotive, salon, and publicworks instead of routing those lifecycles through generic takeaway orders.
2. Extend the supported catalog-sale matrix only after measured items, variants/options, plan/channel entitlements, and branch-specific pickup rules have complete server and recovery coverage.
3. Add browser end-to-end tests for disconnect during submit, response loss after server acceptance, activity changes between queue and replay, concurrent tabs, account/branch switching, backup restore, and auto-sync after reconnect.
4. Run Node 24, TypeScript, focused Playwright, and production build checks before opening a review PR. Keep the Service Worker privacy boundary unchanged.


## Implemented cloud slice (2026-10-31)

- The connected restaurant POS now opens the encrypted local POS page when it detects the browser is offline and has a selected branch. The handoff is explicit: the current cart is **not** transferred or claimed as saved; the operator must rebuild the simple order in the local page.
- The POS API now returns the tenant activity code and a versioned offline capability contract. The encrypted profile stores that contract, and each queued order carries its activity code and contract version.
- Offline catalog checkout is enabled only for simple product-sale activities: restaurant, cafe, sweets, grocery, clothing, perfume, accessories, watches, gifts, and ecommerce. Restaurant/cafe may use takeaway or dine-in; other enabled activities are takeaway-only.
- Service lifecycle activities (carwash, laundry, automotive, salon, and publicworks), unknown activity codes, service products, measured items, variants/options, customer data, notes, coupons, payments, delivery, reservations, and pickup-point workflows remain online-only.
- The server checks contract-tagged offline replays against the current activity after the existing request-key duplicate lookup. This ordering preserves a successful request whose response was lost, while rejecting a not-yet-accepted replay after the activity contract changes.
- When connectivity returns while the encrypted POS page remains open and unlocked, it retries the encrypted queue. Network failures retain pending rows; stale contracts and deterministic validation failures move rows to manual review. The existing exclusive Web Lock remains in use.
- No Service Worker caching boundary was widened. Authenticated dashboard/API/SSR/RSC data remains network-only.

### Verification state for this slice

- Added contract-matrix and replay-envelope tests to `scripts/foon-offline-pos.test.mjs`; that file is already included by `test:resources` and `test:offline-pos`.
- Added source-level integration assertions for the cloud handoff, activity binding, idempotency ordering, and online retry.
- These tests have **not** been executed in this run. The GitHub commit status endpoint returned no checks and no workflow runs were available for the new head; local Node/Next.js/MariaDB execution is not available here.
- The change set is restricted to cloud app/API/library/public/test/docs paths. No Windows path is present in the compare result.
