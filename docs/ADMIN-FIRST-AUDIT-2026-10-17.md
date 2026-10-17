# FOON V2 — admin-first acceptance ledger (2026-10-17)

Scope: inspected repository source only. This is **not** a live production browser, account, or database acceptance report. The nfoodz.com endpoints were not reachable from the inspection environment. No production data has been changed.

## Status definitions
- **Confirmed defect**: discrepancy reproduced in the reviewed source.
- **Candidate fix**: committed on a test branch, not integration-tested or deployed.
- **Unverified**: module source exists, but full authenticated end-to-end operation has not been established.

## Ordered acceptance phases

| Order | Scope | Current evidence / outstanding checks |
| --- | --- | --- |
| 1 | Super admin overview and navigation | **Confirmed:** `/admin/tenants` previously counted only up to 200 loaded stores; candidate branch uses a separate filtered SQL count. `/admin/media` exists but is absent from sidebar navigation; gate access for super admins before exposing it. `/admin/users` lists at most 200 without pagination. |
| 2 | Tenant creation / activity onboarding | **Confirmed:** admin create flow previously saved generic restaurant/store without `tenant_business_profiles`. **Candidate fix:** select one of 15 presets, region, country, derive currency on server and persist profile within same transaction as tenant/owner/branch/free subscription. Local pure-policy tests: 4 passed; DB/browser/build pending. |
| 3 | Plans, entitlements and subscriptions | APIs and editors exist. Must test all 15 activity entitlements; note that the activity selector in `admin/plans/plan-features.tsx` is **display filtering**, not activity-specific plan grants. Test renewals, subscription dates, permission changes and audit. |
| 4 | Billing, refunds and platform finance | Transfer review screens and payment code exist. Verify bank evidence approval, invoice settlement and gateway refund/ledger idempotency in disposable DB and provider sandbox. |
| 5 | Admin users, media, pages, translations, email | Test RBAC, SMTP delivery and retry, asset quota enforcement, three-language page publishing, audit logging, and pagination at scale. |
| 6 | Merchant setup & employee/branch roles | Test store profile, country/currency, activity-specific dashboards, employee invitations, and role/branch boundaries with multiple test tenants. |
| 7 | Catalog, media, CSV and public menu | Test categories/items, images (real decodable photos), options/variants/stock/measurements, imports, pricing and customer 320px/RTL templates. |
| 8 | POS/KDS/orders/invoicing | Run sell-to-invoice journey for all activities, tax/currency and immutable totals; avoid unapproved customer-email disclosure and duplicate processing. |
| 9 | Reservations/waitlist/tables/waiter | End-to-end table lifecycle, preorder-linked booking, configurable no-show, staff assignment, guest notifications and conflicts. |
| 10 | Delivery, pickup, hotel rooms and services | Verify registered pickup points and hotel rooms, delivery areas/fees/driver assignment, quotation → work order → invoice. |
| 11 | Customers and notifications | Saved address, profile, loyalty, order-status realtime, email, controlled sound notifications and translations. |
| 12 | Release acceptance | Cross-tenant RBAC, backups/restore, load, accessibility/mobile, WAN outage recovery for the **existing web/Edge features**, rollback, actual Hostinger build and published SHA. **FOON Desktop/Windows is out of scope.** |

## Immediate next checks
1. Run `node --experimental-strip-types --test scripts/admin-activity-provisioning.test.mjs` on Node 24, then `npm run typecheck`, `npm run lint`, and `npm run build` **outside GitHub Actions**.
2. Against an isolated migrated MariaDB: create a grocery and a salon from admin; verify `tenant_business_profiles`, owner/branch/subscription rows are atomic and no row remains after invalid activity/region; test non-super-admin forbidden paths.
3. Validate the admin page on desktop and 320px mobile in Arabic/English/French; check navigation, result counts beyond 200, country selection and error messages.
4. Do not open merge-ready PR, merge to main, trigger automatic Hostinger publication, or change production schema until verification succeeds.
