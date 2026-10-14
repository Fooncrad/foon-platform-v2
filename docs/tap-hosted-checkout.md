# Tap hosted checkout adapter

The server-only adapter in `lib/payments/tap-hosted-checkout.mjs` creates a Tap Charge with `source.id=src_all`, a stable `reference.idempotent`, a webhook URL, and a customer return URL. It never accepts card details and does not mark an order paid.

Official references:
- https://developers.tap.company/reference/charges
- https://developers.tap.company/docs/recommendations-best-practices

## Current activation state

Electronic checkout remains disabled. The adapter is not yet called by a public/customer route. Dashboard credentials and webhook endpoints remain available independently. Neither the adapter unit tests nor synthetic webhook integration tests make real gateway charges.

Before activating a customer payment route:
1. Authenticate the actual order customer and check active tenant/branch ownership and entitlement.
2. Derive amount/currency from the stored order, not the browser, and choose the saved branch or tenant configuration explicitly.
3. Persist a durable initiation record and its idempotency key before contacting Tap. Prevent settings rotation while creation is unresolved. Never replace the key after a timeout, ambiguous response, crash, or persistence failure.
4. Reuse the same initiation record under concurrent requests and retries. Store and reconcile the returned charge ID with `registerPaymentAttempt` in a committed transaction before exposing the hosted URL.
5. Show payment confirmation only after the authenticated webhook validates the bound transaction, stored amount, currency, and scope. A browser return or Charge creation response is not settlement.
6. Test authenticated customer access, branch isolation, simultaneous initiation, provider timeout, early callback, lost response, cancellation, and configuration changes against the disposable database.

The adapter uses the fixed Tap API origin, rejects HTTP redirects on the secret-bearing request, bounds responses to 64 KiB, and checks charge identity, mode, amount, currency and hosted URL. Only HTTPS URLs at Tap domains are returned. Errors never echo provider bodies or customer data.

## Sandbox completion

Migration `0084_payment_sandbox_completion.sql` adds the distinct `test_completed` attempt status. A correctly authenticated sandbox success completes only its matching attempt after checking the stored order, amount, currency and branch. The business order stays unpaid and its version is unchanged. Incorrect or unmatched callbacks cannot complete another attempt. Early sandbox callbacks reconcile when the trusted server adapter later registers their exact transaction ID. Completed sandbox attempts no longer block a merchant from switching to live configuration; unresolved attempts still do.
