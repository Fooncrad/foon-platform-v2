# Payment webhook reception
Merchant payment settings display a copyable webhook URL for the saved gateway and test/live environment, verification readiness, last authenticated receipt time and its reconciliation status.

## Supported verification
- Stripe: HMAC-SHA256 over the exact raw body with the Stripe-Signature timestamp and a 300-second freshness check; snapshot payment_intent.succeeded events only settle payments.
- Moyasar: constant-time secret_token comparison, explicit live/test flag and payment_paid event validation.
- Tap: hashstring HMAC using the account secret, ISO currency formatting and captured charge verification. Supply the URL as post.url in the payment initiation adapter; there is no separate Tap webhook secret.
- HyperPay: AES-256-GCM encrypted hex body or encryptedBody wrapper; 64-hex encryption key, IV/tag header verification, configured entity ID, capture/debit and successful non-test result checks.
- Cash has no webhook. Custom providers have no receiver URL until a verified adapter exists.

Official references:
https://docs.stripe.com/events/manage-webhook-endpoints
https://docs.moyasar.com/api/other/webhooks/webhook-reference
https://developers.tap.company/docs/webhook
https://hyperpay.docs.oppwa.com/tutorials/webhooks
https://hyperpay.docs.oppwa.com/reference/resultCodes

## Merchant setup
1. Save the gateway and environment inside the merchant dashboard; each tenant/branch receives an independent opaque endpoint.
2. Copy its URL into the provider settings or payment initiation request as required.
3. Enter the provider verification secret/token/encryption key (Tap uses the existing API secret) and save.
4. Send a provider test notification, then refresh webhook status. Saved secrets alone are not proof of connectivity.

## Platform prerequisites
Apply migration 0080 on the authorized test database. APP_URL must be the actual HTTPS application origin; local HTTP loopback is allowed only for development. Configure FOON_PAYMENT_VAULT_KEY as described in business-payment-setup.md. A URL in source is not proof of deployment.

## Financial guarantees and integration boundary
No raw payloads, card data, customer contacts or secret tokens are stored in receipt records. Invalid signatures are rejected without recording an authenticated receipt. Body size is limited to 128 KiB.

A live successful receipt can mark an order paid only when a server-registered payment attempt matches tenant, branch, provider, environment, provider transaction ID, amount and currency. Cancelled/refunded orders require review. Test callbacks never mark business orders paid. Repeated receipts are idempotent and do not increment the order version again.

The trusted initiation adapter must call registerPaymentAttempt in its transaction after obtaining the provider transaction ID. It derives the expected amount from the persisted order. An authenticated callback that arrives first is stored as unmatched and reconciled when that adapter registers the payment. Never bind transaction IDs through an unauthenticated browser request.

Online checkout initiation remains disabled until its provider adapters are connected and tested. Webhook reception does not by itself activate collection. Supported non-capture event formats are recorded as ignored; unsupported event schemas are rejected. Automated refunds and dispute handling are not implemented by this receiver.

Changing provider/environment rotates the endpoint; updating keys in the same environment preserves the configured URL. Old URLs return 404 after rotation.

## Tests
test:payment-webhooks covers all four provider formats, altered bodies/keys, wrong environment/account, stale signatures, ignored authorization events and minor-unit conversion.
payment-webhook.integration.test.mjs covers actual Next routes and MariaDB: stable/rotating URLs, invalid signatures, live settlement, duplicate delivery, amount mismatch, cross-tenant metadata spoofing, early receipt reconciliation, metadata access, test isolation and size limits.


Pending registered payment attempts block gateway/environment/secret or account-reference changes, preventing their callback URLs from being invalidated before reconciliation.

Migration 0081 enforces provider transaction uniqueness across tenants and branch scopes; one payment ID cannot settle two orders. Existing duplicates cause migration failure and require investigation, never automatic deletion.
