# FOON V2 — order, subscription and referral receipts (PR #193)

## Product behavior
- A registered customer's confirmed paid checkout (any activity using `restaurant_orders`) creates one **payment receipt**, stored in `restaurant_customer_invoices`, and one customer-account notification. Email is queued only when `users.email_verified_at` is present. Statuses in the account: pending, sent, failed and skipped. The email contains order lines, totals and an authenticated URL for the **immutable** snapshot.
- A paid FOON platform subscription creates its existing `platform_payment_receipts` row only upon manual administrator verification. Verified active owners receive the receipt through **platform SMTP**. All owners can view the receipt under their business Payments page; its URL is owner-authorized.
- Creator referral commission is **earned** only after that verified platform subscription. Earned, confirmed paid and reversed statuses produce distinct account/email notifications. The creator alone can view the detailed commission statement; only paid statements may say the payout was actually made.
- Order, subscription and referral documents are **receipts/statements, not certified tax invoices**. Browser print provides **Save as PDF**; the system does not attach a PDF to outbound email. Regulatory tax invoicing and refunds/credit notes require separate validation.

## Required existing migrations (no new SQL in this PR)
Run a read-only confirmation against the deployed database:

```sql
SELECT id, applied_at FROM schema_migrations
 WHERE id IN (
  '0015_billing_receipts.sql',
  '0016_notification_outbox.sql',
  '0018_customer_notifications.sql',
  '0072_customer_invoice_archive.sql',
  '0152_creator_subscription_referrals.sql'
 ) ORDER BY id;
```

Confirm these tables exist:
```sql
SHOW TABLES LIKE 'restaurant_customer_invoices';
SHOW TABLES LIKE 'platform_payment_receipts';
SHOW TABLES LIKE 'platform_notification_outbox';
SHOW TABLES LIKE 'customer_creator_commissions';
```

## Tests on an isolated environment
Do not run database integration tests against the production Hostinger database.

```bash
npm ci
npm run typecheck
npm run test:invoices
npm run test:mail
npm run test:creator-commissions:integration
npm run build
```

For `test:creator-commissions:integration`, configure only a disposable local MariaDB `127.0.0.1/foon_migration_test`; the suite rejects any other target.

Manual acceptance:
1. Create two unrelated customer accounts and pay one order using the **live verified** workflow or a merchant-attested POS cash transaction in a disposable test database. Confirm only the owner account sees the invoice and exactly one outbox record exists after retries.
2. Verify an unverified-email account sees its paid receipt in account and has **no email** queued.
3. Confirm a bank-transfer paid subscription as super admin. Check owner-only receipt and platform-sender email; a second approval must not produce another receipt.
4. Create a creator referral, approve the paid subscription, confirm **earned but unpaid**, then record actual payout. Verify the statements and separate events are creator-only; no merchant SMTP credentials are loaded.
5. Simulate an SMTP outage, confirm the invoice remains visible, retry queue delivery, check `sent` updates the archive, and test mail-accepted/archive-status-failed reconciliation **without another email**.
6. Confirm all three language templates display correctly and print as PDF without the navigation toolbar.
7. Test that employees, unrelated merchants, other customers, and unauthenticated users cannot load private invoice or commission links.

## Deployment flags
- `APP_URL=https://nfoodz.com` (or `NEXT_PUBLIC_SITE_URL`) is used to construct absolute authenticated invoice links.
- Supply valid platform `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` as needed.
- Run `npm run notifications:worker` from trusted scheduled infrastructure, ideally once per minute. The business request also attempts after-commit dispatch; do not rely exclusively on that to survive crashes.
- Check `platform_notification_outbox` and `restaurant_customer_invoices.email_status` for any non-sent messages; five unsuccessful delivery attempts fail for manual review.
- No automatic backfill/mass email of historical paid transactions is included. Old data requires a separately reviewed migration to avoid accidental duplicate historical email.

## Known limits
- This PR covers customer checkout orders backed by `restaurant_orders`. Separately settled **service-only customer invoices** in `restaurant_resources` may not have a server-verified customer identity; they intentionally are **not** emailed to arbitrary customer names/phones. A separate verified customer-account linkage is required before service invoice email automation.
- Receipt pages are HTML documents printable to PDF, not email PDF attachments. They are not ZATCA-accredited tax invoices.
- PR was prepared via GitHub connector; Node/Next.js build and real MariaDB suite must run in an independent environment prior to merging. GitHub Actions are not used as the source of truth for acceptance.
