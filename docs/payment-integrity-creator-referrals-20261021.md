# FOON V2 — payment paths and creator subscription commission review

## Scope and verified code wiring
1. **FOON platform subscription** is **bank-transfer/manual approval**, not an automatically settled gateway. A business owner from any supported merchant activity can submit monthly/yearly paid subscription request using a server-calculated enabled `package_plan_prices` amount and tenant currency; an admin reviews evidence and **verifies actual bank funds externally**, then approves or rejects. Only approval creates a platform receipt and activates the subscription in one DB transaction.
2. **Personal creator referral** is only attached to a **newly registered business** from `/register?ref={creatorHandle}` or the existing-account `/restaurant/register?ref={creatorHandle}` flow. Referral stored immutably against `tenant_id` and `creator_user_id`. It never grants creator access to the referred tenant. Creator accounts cannot be merchant owners, staff or platform admins.
3. **Commission** on eligible **paid monthly and yearly** subscription approval: global platform configured `enabled` and `percentage` (0–100%, two decimals) are snapped at approval. Only `platform_payment_requests.status='pending'` can be approved; price/currency/cycle must match enabled plan price; free or zero-amount plans are blocked. One immutable `customer_creator_commissions` row per approved paid request with `UNIQUE(payment_request_id)`. This includes renewals **only after a distinct new paid bank transfer is confirmed**; it does not auto-bill monthly/yearly.
4. **Payout** is a **second independent manual step**: `earned` is not money sent. Super admin must confirm actual payout outside FOON, save transfer reference and switch to `paid`; can void earned commission with documented reason before payout. Paid commissions cannot be silently reversed. There is NO bank payout API.
5. **Bank-transfer evidence** is a private image/PDF up to 2 MB. Merchant can upload/replace while pending only. Platform finance admins can download; public, other merchants, creator and support-role access are not permitted. Evidence alone is NOT proof funds were received.
6. **Anti-double-credit**: existing receipts unique on payment request; new `platform_approved_transfer_claims(currency,transfer_reference)` enforces one reference per currency across approved requests. Historical approved receipts backfilled with `INSERT IGNORE` (duplicates need separate manual review). At runtime another request with the same approved reference returns conflict and rolls back.
7. **Customer/restaurant merchant gateway settings** are not platform subscription payment settings. Merchant payment gateway config supports `moyasar`, `tap`, `stripe`, `hyperpay` for credential storage and verified webhook settlement. At present, the supported **customer checkout initiation** adapter in `lib/payments/customer-checkout.ts` and service invoice checkout in `lib/payments/service-invoice-checkout.ts` accept **Tap test/sandbox only**. They do not charge money in live mode.
8. **Manual cash** remains a separate merchant payment type and is not a verified electronic settlement. The `app/api/restaurant/payments/refund-reviews/route.ts` workflow records two-person refund **review** only and does not initiate a real provider refund.
9. **Webhook callbacks** verify signatures, tenant/branch scope, amounts, provider IDs and mode, then durably settle only eligible matched attempts; test events must not mark orders paid. Live provider customer initiation, external bank reconciliation, automatic refunds, provider payment fees, chargeback handling and automated creator payouts remain unimplemented. Do not advertise them as ready.
10. **Security repair**: `lib/payments/customer-checkout.ts` no longer silently treats a missing `enterprise` grant as enabled; only an explicit numeric enabled=1 authorizes the paid module.

## Schema + deployment sequencing
- The personal creator profile migrations `0107`, `0108` must already be applied before referrals.
- **New reviewed migrations**: `0152_creator_subscription_referrals.sql`, `0153_platform_payment_transfer_evidence.sql`, `0154_platform_approved_transfer_claims.sql`, in this exact order after prior `0150` and `0151`.
- **Do not re-register a migration ledger ID without running its SQL.** Back up Hostinger DB and compare schema_migrations. Test in isolated `foon_migration_test` before any production change. No migration has been applied to production in this PR.
- Confirm **`platform_creator_referral_settings` is disabled and 0% by default**; a super admin explicitly opts in and sets the rate after reviewing legal terms.
- **Read-only audit on historic approved transfer duplicates**:
```sql
SELECT currency,transfer_reference,COUNT(*) AS approved_count
FROM platform_payment_requests WHERE status='approved'
GROUP BY currency,transfer_reference HAVING COUNT(*)>1;
```
- **Read-only audit paid request/receipt mismatch**:
```sql
SELECT p.id,p.tenant_id,p.status,p.amount,p.currency,r.id AS receipt_id
FROM platform_payment_requests p LEFT JOIN platform_payment_receipts r ON r.payment_request_id=p.id
WHERE (p.status='approved' AND r.id IS NULL) OR (p.status<>'approved' AND r.id IS NOT NULL);
```
- **Read-only commission duplicates by payment**:
```sql
SELECT payment_request_id,COUNT(*) FROM customer_creator_commissions GROUP BY payment_request_id HAVING COUNT(*)>1;
```

## Pre-merge local tests (NOT GitHub Actions as acceptance mechanism)
1. `npm ci && npm run typecheck && npm run lint && npm run build`.
2. `node --experimental-strip-types --test scripts/creator-paid-subscriptions.test.mjs scripts/payment-transfer-evidence.test.mjs`.
3. Use only local `mysql://...@127.0.0.1:3306/foon_migration_test`, apply reviewed migrations there and run `node --experimental-strip-types --test scripts/creator-subscription-commission.integration.test.mjs`.
4. Re-run existing payment regression suites: `npm run test:payments`, `npm run test:payment-webhooks`, `npm run test:migrations`, and the payment settings/webhook/customer checkout/service invoice integrations against the **local** disposable DB.
5. Test owner, creator, owner+creator conflict, employee, admin, support, cross-tenant attempts, incorrect origin, duplicate reference, failed/missing proof, pending/rejected/approved states, monthly/yearly and repeated payout. Verify no commission is earned until receipt approval and no private media/proof is exposed.
6. After complete test evidence: manually review PR and merge, apply migrations under approved release, deploy Hostinger, verify live server; never label sandbox-only provider initiation as live-ready.

## Financial and operational disclosures
- Default percentage disabled; no retroactive commission creation for old approved payments or pre-existing tenants without referral.
- Commission calculated from the **recorded gross paid plan amount** (as requested), using integer cents and rounded half-up; legal/tax invoice fees, net-of-tax treatment and regional affiliate terms need policy/legal review before paying out real money.
- Registration can be attributed across all business activities; it does not bypass country and tenant isolation. Customer-to-merchant identity separation remains intact.
- Referral amounts are stored per payment currency; creator earnings dashboard totals **per currency**, never converts currencies without a verifiable FX rate.
- The admin evidence review is a bank-reference/manual process, not a real-time Open Banking confirmation; admin must verify the bank statement before approving.
