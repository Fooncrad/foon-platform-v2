# Tap customer checkout — test branch

Customers can start or resume a Tap hosted test payment beside their own unpaid order in /customer. Owners/managers enable it inside /restaurant/payments with Tap, test mode, a saved public and secret key, and an HTTPS APP_URL. A saved branch override always takes priority, including a disabled override. Live checkout and other providers remain disabled.

Migration 0085 adds durable initiation records. Apply migrations through 0085 only on an authorized test database before using these routes. No production deployment or database changes are implied.

The POST /api/customer/payments accepts only orderId. It checks session, same origin, actual order customer, tenant customer relationship, active user/tenant/branch, order status and active orders entitlement. Neither merchant membership nor browser amounts authorize payment. The service calculates amount/currency from the stored order.

The service commits an initiation ID before contacting the fixed Tap API. Concurrent requests and retries reuse that ID in reference.idempotent. A returned charge ID is bound through registerPaymentAttempt and committed before its hosted URL is exposed. A callback arriving before the creation response reconciles when binding occurs. Browser returns and creation responses never settle orders. Authenticated test callbacks complete the attempt but leave the business order unpaid.

Unresolved creation and pending attempts lock settings and prevent a branch override from bypassing an unresolved tenant-scope checkout. Changed order totals, branch, ownership, or retry payload stop checkout and require review. Secret-bearing requests disallow HTTP redirects. Responses are bounded and validated; no card details are collected. Initiation records store no plaintext secrets or customer names/emails.

## Recovery limits

Creation failures retain the durable key and return CHECKOUT_UNCERTAIN. A retry reuses the same key and payload. Ambiguous creations older than 15 minutes and ready hosted links older than 30 minutes require review. No code automatically invents another key or another charge for that order. Provider cancellation, expired/failed charge reconciliation and a merchant review/resolution UI remain to be implemented before live activation. Do not delete unresolved records to unblock configuration. The public route cannot perform real collection.

Tests use a disposable MariaDB and the built Next HTTP routes, with a synthetic fixed-origin Tap HTTP responder passed directly to the service. There is no configurable provider origin, fixture API, or test bypass in the deployed route. No real gateway request is made in CI.

Official references:
- https://developers.tap.company/reference/charges
- https://developers.tap.company/docs/recommendations-best-practices
