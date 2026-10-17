# FOON V2 — Detailed admin-to-customer functional gap ledger
Updated: 2026-10-17 · Source: `main` (c2346459), with a separate unmerged admin-provisioning candidate branch.

> **Scope / confidence:** This is a source-code inventory. Direct production requests for `https://nfoodz.com/` and `/api/health` could not be completed in this inspection environment. Do not call features operational, production-ready or missing just because one file exists (or one route is absent). An authenticated browser journey and test database are still needed.

Legend: **C** = confirmed code-level shortcoming, **P** = partial implementation/explicit limitation, **U** = unverified end-to-end workflow, **F** = candidate fix in unmerged branch. Priority: **P0** revenue, access, provisioning or data-integrity blocking; **P1** essential business functionality; **P2** UX/reporting maturity.

## Phase A — Super-admin: inspect and close every subsection

| ID | Priority | Module | Detailed acceptance gap | Evidence / state |
|---|---|---|---|---|
| A01 | P0 | Store provisioning | Admin must choose exact activity among 15, location, country/currency, and persist business profile transactionally with owner/branch/free subscription. Invalid cases must roll back. | **C/F**: `app/api/admin/tenants/provision/route.ts` on main stores only generic `kind`; candidate `fix/admin-activity-provisioning-20261017` adds activity profile and tests, not merged. |
| A02 | P1 | Store directory | Beyond 200 stores: accurate total/active/pending counts, server pagination, status/activity/country filters and stable search. | **C**: `app/admin/tenants/page.tsx` and `app/api/admin/tenants/route.ts` limit 200; page counts loaded slice. F candidate updates totals but pagination still outstanding. |
| A03 | P1 | Store detail | View owner email/phone (authorized admin only), branch/contact/country/currency, plan, outstanding orders and direct safe "open store" link. | **P/U**: `tenant-manager.tsx` currently shows name, slug, generic kind, plan and status, plus super-admin access. |
| A04 | P0 | Store lifecycle | Suspend/reopen/unlink/reactivate with reason, session implications, payment/active-order safeguards, audit and reversible controls. | **U**; test API `tenants/[id]/status` with real accounts. |
| A05 | P0 | Administrative impersonation | Enforce super-admin-only controlled access, expiry, audit, unmistakable impersonation indicator and safe exit. | **U**; `tenants/[id]/access` exists. |
| A06 | P1 | Users | Search by email/name/tenant/role, pagination, global counts, active/inactive sessions, disable/recover and permissions audit. | **C**: `app/admin/users/page.tsx` lists 200 maximum and no pagination. |
| A07 | P0 | Admin RBAC | Separate super_admin/admin/support capabilities and test forbidden GET/PATCH/POST, cross-tenant reads and user suspension. | **U**, source guards exist. |
| A08 | P0 | Plans by activity | Activity-specific capability/grant/limit controls; changing restaurant plan must not unintentionally grant unsupported salon capabilities. | **C/P**: `plan-features.tsx` activity selector is explicitly a display filter; changes write shared `package_plan_features`. |
| A09 | P0 | Plan catalog | Create/edit/disable 4+ plans, free restrictions, usage counts and migrations/backfill. | **U**, editors and bootstrap exist. |
| A10 | P0 | Pricing | Monthly/yearly, currencies/country, grace periods, effective dates, price changes and plan-switch safety. | **U**, `plan-prices.tsx` exists. |
| A11 | P0 | Subscriptions | Start/renew/pause/expire, upgrades/downgrades, authorization and accurate grant application at runtime. | **U**, `subscriptions` API/UI exists. |
| A12 | P0 | Billing transfers | Verified transfer receipt, rejection reason, correct amount/currency, tenant identity, matching ledger/audit and renewals. | **U**, `billing` and receipts exist. |
| A13 | P0 | Payment reconciliation | Refund decisions, duplicate payment/replay, reconciliation against provider, customer and merchant notifications. | **P/U**, integrations require sandbox/live confirmation. |
| A14 | P0 | Platform payment secrets | Verify encrypted storage, key rotation, webhook signing, no secret exposure and provider fallback. | **U**, `lib/payments/` and webhook routes exist. |
| A15 | P1 | Global brand | Persist *and actually render* site names, support email/phone, default language, footer/header/logo across public pages. | **C/P**: `app/admin/settings/settings-editor.tsx` expressly says saved settings are not published to public UI until wired. |
| A16 | P1 | Marketplace administration | Admin enable/disable market globally/per country, activity and visibility; public market must filter true activity, not just restaurant/store. | **C**: `/market` filters only generic `kind`, returns max 100; admin configuration keys have no marketplace control. |
| A17 | P1 | Translation CMS | AR/EN/FR content coverage, fallback, search/paging, RTL/LTR, persistence in real pages; Arabic base protection. | **U**, `translations` editor exists. |
| A18 | P1 | Pages CMS | Draft/publish and delete/archive/version/preview, all 3 languages, nav/footer binding, safe content encoding. | **P**: create/edit/status editor present; delete/preview/version not exposed in `pages-editor.tsx`. |
| A19 | P1 | Notifications and rules | Each operational event: in-app/email/sound selection, worker retry and no duplicate/never-ending alerts, customer/merchant visibility. | **P/U**: event toggles exist; actual dispatch and cross-channel acceptance unverified. |
| A20 | P1 | SMTP administration | Configuration status, safe test delivery and failure diagnostics without exposing passwords, worker delivery on Hostinger. | **P**: `settings-editor.tsx` explicitly has no send-test control; transport env-driven. |
| A21 | P1 | Notification templates | Localized template editor, outbox queue, failed/retry/cancel, worker concurrency and actual recipient matching. | **U**, notification pages exist. |
| A22 | P1 | Admin media | Role-controlled media-account quotas, images/files, audit and navigation entry. | **C/P**: `/admin/media` page exists, but `app/admin/layout.tsx` sidebar omits it. |
| A23 | P1 | Finance reports | Revenue by provider/currency/plan/country/activity, receipts, subscriptions churn, disputes, CSV exports. | **U**, no validated end-to-end reporting acceptance. |
| A24 | P1 | Audit log | All sensitive actions (impersonation, role, settings, billing, plan edits) actor/target/reason, paging/filter and audit export. | **U**, audit route/page exists. |
| A25 | P0 | Auth and account security | Register, email verification, password reset, session timeout, Google sign-in requirements, role redirect, rate limits and mail delivery. | **P/U**: `app/api/auth` currently exposes login/logout/me/register/password-reset/reset only; no dedicated verify-email or Google OAuth route in the current tree. Verify intended auth architecture before claiming final absence. |
| A26 | P0 | Admin release controls | Migration readiness, backup/restore test, incident log, rollback, platform health and secrets audit before production promotion. | **U**; no production changes authorized. |

## Phase B — Tenant onboarding and all-business shared modules

| ID | Priority | Workstream | Acceptance requirements / remaining questions | State |
|---|---|---|---|---|
| T01 | P0 | Registration → activation | Correct activity, country, currency, region, tax profile, owner, main branch, plan and no partial writes on error. | **P/U**; normal registration flow exists, admin route gap A01. |
| T02 | P0 | Tenant & branch isolation | Customer vs staff identities, permissions per branch, no cross-tenant leak, strong tests for all actions. | **U**, access checks exist. |
| T03 | P1 | Branches | Add/edit/suspend, branch-based pricing/hours, delivery, availability, QR, separate receipts and staff assignments. | **P/U**; branch API supports CRUD subset; activity-specific business rules unverified. |
| T04 | P1 | Employee lifecycle | Invitations, join/accept, role+branch, permission grid, revocation, onboarding, shifts/attendance/leaves and employee-not-customer. | **P/U**, invite and grants code exists. |
| T05 | P1 | Merchant profile | Activity-specific legal identity, phone, email, location, contact, opening hours, assets, localization. | **U**. |
| T06 | P0 | Subscription gating | Each plan and role really blocks disallowed modules on server, not just hides UI. | **U**, tenantEntitlement used in routes. |
| T07 | P0 | Catalog | Categories/services/products, localized names/details, upload images, valid SKU, variants, measured quantity, per-branch stock, edit/archive. | **P/U**, shared catalog editor/API exists. |
| T08 | P1 | CSV | Category/item import and resume, schema preview, duplicates, errors per row, arabic BOM and saved progress; real browser download. | **U**, bulk-import exists. |
| T09 | P1 | Storefront templates | Separate layouts and editorial controls per activity; AR/EN/FR, cover/images, mobile 320px, no page horizontal scroll. | **U**, template system exists. |
| T10 | P0 | POS | Server-side pricing/tax/discount, secure inventory deduction/release, cash receipt, invoice, split/merge, idempotent retries. | **P/U**, generic POS exists. |
| T11 | P0 | Orders/KDS | Per-type tickets, branch/section, status updates to customer without manual refresh, cancellations/refunds, sounds and confirmation. | **P/U**, order-workspace and status polling exist. |
| T12 | P0 | Payments | Merchant-owned gateway credentials and webhook URL; manual/cash vs provider sandbox/live, authorized settlements, refund/chargeback/duplicates. | **C/P**: `app/api/restaurant/payments/settings/route.ts` explicitly marks checkout-supported only for Tap in `test` mode; other configured gateways remain pending integration. |
| T13 | P1 | Delivery | Delivery zones, fee by region/distance, min order, schedule, drivers, tracking/returns, saved verified customer addresses. | **P/U**; storefront cart currently accepts freeform phone/address but no selection of configured zones. |
| T14 | P1 | Pickup | Registered pickup points rather than generic "takeaway" only, selection and handover identity. | **C/P**: activity storefront cart currently offers takeaway or delivery only. |
| T15 | P1 | Hotel/room services | Pre-registered hotel room, permission/room validation, room service order, billing/notifications. | **C/P**: order workspace declares hotel/room channels but generic activity storefront cart does not present them. |
| T16 | P1 | Appointments | Resource/staff/service duration/time-slot capacity, schedule, cancellation/no-show, linked order/invoice. | **P/U**, service-order scheduling exists but specialized workflows need acceptance. |
| T17 | P1 | Reservations | Restaurant table booking, advance order, category of occasion, no-show timer, linked inventory/payment and customer notice. | **P/U**, reservation routes and calendar exist; PR #66 carries unmerged no-show changes. |
| T18 | P1 | Waitlist and waiter | Guest count, time-to-cancel, cooldown, assigned waiter/section, finish reason, sound/in-app. | **P/U**, resources and waiter API present. |
| T19 | P1 | Services/work orders | Quote→accept→work order→line items/parts→invoice→settlement with tenant/branch and replay guards. | **P/U**, service order workspace and conversion functions exist. |
| T20 | P1 | Customer accounts | Registration from store with global customer identity, saved profile and address, no re-entry, order history, cancellation. | **P/U**; PR #66 unmerged saved-address changes. |
| T21 | P1 | Loyalty | Configuration per tenant, points earned/redeemed, expiry, caps, ledger and customer-visible balance. | **P/U**: `migrations/0066_customer_loyalty_delivery.sql` defines ledger, but lifecycle/UI must be validated. |
| T22 | P1 | Notifications | Per store event preferences and durable delivery, sound mute/ack, live customer order state, email language and privacy. | **P/U**; client polling and outbox exist. |
| T23 | P1 | Reports | Per activity, staff/branch/currency/time, stock/cost, taxes, refunds and export. | **P**: `reports-workspace.tsx` currently presents daily/branch/product sales only. |
| T24 | P2 | Offline web | Existing web+Edge offline behavior and reconnect semantics; do **not** develop Windows Desktop until website acceptance. | **U**; simulated tests do not establish real-device reliability. |
| T25 | P1 | Public marketplace | Per-country/activity category, open/closed, address/contact/cover/status, visibility controls, pagination. | **C/P**: current `app/market/page.tsx` exposes only restaurant/store filtering, 100 result limit and simple cards. |
| T26 | P1 | Support and legal | Store policies, terms/refunds/privacy, customer messaging, complaints/audit, Arabic/English/French and contact channels. | **U**, site policy/pages code exists. |

## Phase C — Activity-specific acceptance: 15 separate tenant workspaces

All rows below are **unverified acceptance requirements**, not claims that the functionality is fully missing. Common auth, payment, reporting, stock and accessibility gates T01–T26 apply to each activity.

| Activity | Required activity-specific capabilities and acceptance tests |
|---|---|
| restaurant | Menu options/allergens; QR table; 4 dining sections; waiter assignment, call cooldown, reservations/waitlist, order-linked booking and no-show, KDS, bill splitting and table state. |
| cafe | Drinks/milk/size choices and modifiers; rapid takeaway and dine-in POS; bar preparation tickets, stock deductions, seating and waiter calls. |
| sweets | Cake/weight/customization, advance collection date and cutoffs, custom note, photos/options, production slot, invoice and pickup/delivery. |
| grocery | Barcode scanning/search, weighed and packaged goods, suppliers, expiry/stock alerts, purchase receiving, per-branch stock, pickup and delivery windows. |
| clothing | Sizes/colors as independent sellable variants/SKUs, per-variant stock and images, exchanges/returns, shipment and tax/discount rules. |
| perfume | Volume/fragrance variants, per-variant price/stock, gift options, sample/tester exclusions, shipping and refunds. |
| accessories | Variant/color/material, grouped options and SKU/stock, shipment/return handling and receipts. |
| watches | Watch-specific showcases, model/serial/warranty, variant/stock, repair/return/warranty evidence and delivery/pickup. |
| gifts | Wrap style/personalization/message, add-on pricing, ready-by time, recipient delivery, packaging and fulfillment tickets. |
| ecommerce | General cart/checkout, product variants, shipping/pickup, tax, coupon, order status, payment, returns and stock synchronization. |
| carwash | Vehicle class/type, service+price and appointment slots, worker assignment, bay resource, work status, invoice/payment. |
| laundry | Customer garments/pieces/weight, pickup and return address, intake photo/receipt, stages, promised time, driver handoff and payment. |
| automotive | Work order, vehicle data, inspection, quote approval, parts/stock, technician time, staged payments and invoice. |
| salon | Service duration, staff expertise/selection, shift and chair/room capacity, deposits/no-show, bundle and final payment. |
| publicworks | Client/site, itemized quotations, approval, project milestones/variation orders, progress claims, procurement and settlement. |

## Phase D — Definite code-level gaps to fix first

1. **A01 / Admin-created tenant profile** — not written on current main; already prepared as an unmerged candidate; test MariaDB before PR.
2. **A08 / Real activity-sensitive plan grants** — activity selector is display-only, shared grant updates risk cross-activity expectations.
3. **T12 / Payment live acceptance** — UI supports multiple configuration providers but declared checkout acceptance is limited to Tap test mode.
4. **A15 / Published platform branding** — settings UI explicitly warns stored settings are not yet wired to public UI.
5. **A16 / T25 / Marketplace** — two generic kinds and max 100 stores; missing activity-based navigation/visibility controls.
6. **A02 / A06 / Merchant/user directory scalability** — 200-row limits and missing pagination; tenant summary counts use loaded slice on main.
7. **T14 / T15 / Storefront order channels** — retail/service cart only presents takeaway and delivery, not configured pickup points or hotel rooms.
8. **T23 / Activity reports** — current merchant UI only daily/branch/product summaries, not full finance/inventory metrics.
9. **A18 / Pages editor** — exposed draft/publish/edit, not versioning, previews or archive/delete.
10. **A22 / Admin media discovery** — accessible page omitted from admin sidebar.

## Phase E — Rules for implementation/closure

- Begin in **admin**: auth/RBAC → tenants → plan/catalog → subscriptions/billing → settings → notifications/media/translations/reporting.
- Then **tenant shared workflow** → **every one of the 15 activity-specific acceptance rows** → **public storefront** → **customer** → final cross-role security.
- Per line item, capture: owner role, source path/API, data fixture, scenario, saved DB row, negative permission test, browser AR/EN/FR at 320px, test status, commit/PR, merge/publish SHA, observed result.
- Reuse existing code; no wholesale overwrite of updated `main` or merging older stacked drafts.
- Node 24 tests + disposable MariaDB + Playwright run **outside GitHub Actions** first; no CI-as-a-service dependency.
- Do not mix status **code found** with **accepted in production**. No auto-merge, publish, reset or migration on production. No Desktop Windows or printer hardware project until website core is accepted.

Relevant source entry points: `app/admin/`, `app/api/admin/`, `app/restaurant/`, `app/api/restaurant/`, `app/[slug]/`, `app/api/customer/`, `lib/platform/activity-presets.ts`, `lib/platform/activity-plan-entitlements.ts`, `app/market/page.tsx`, `docs/remaining-release-work.md`, issue #32.
