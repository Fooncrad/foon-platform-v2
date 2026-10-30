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
