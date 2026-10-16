# Remaining release work

Updated 2026-10-16. This checklist is not a completion claim. Issue #32 remains open.

## Verified locally — 2026-10-16
- Watches are a separate retail activity with localized registration, dashboard, payment and storefront labels, `watch-showcase` as the default, and no dining tools. `node --test scripts/activity-coverage.test.mjs` passed.
- `npm run build` passed. `npm run test:operations` passed against a disposable MariaDB 11.8 database after applying migrations there only. Coverage includes activity catalog to POS and invoice currency/amount checks, quote-to-service-order conversion, image upload/ordering/deletion and tenant isolation.
- `npm run test:browser` passed 6/6 in the official Playwright 1.62.1 container against the disposable MariaDB database. It covered all 15 activity dashboards at 320px in AR/EN/FR, retail variants and laundry pickup, locale handling and measured catalog controls. Run `npm run test:operations` first on the same test database to seed the enterprise-plan fixture.
- Edge sync checks passed locally: the LAN gateway/SQLite/backup suite passed 4/4; the MySQL 8.4 cloud integration passed 2/2 with `EDGE_TEST_HTTP=true` against a disposable localhost database, including signed receipts, authorization, idempotent replay, lost-ACK retry and SQLite restart recovery; the Edge console browser check passed 1/1. This exercises the local Next.js API and MySQL path, not a deployed central service.
- Worker, bridge, receipt and protocol checks passed 23/23. The two MySQL integration cases initially require `EDGE_TEST_DATABASE_URL`; rerunning with the isolated MySQL 8.4 instance passed both.
- Customer delivery addresses now have session-scoped CRUD, a single transactional default, AR/EN/FR account UI and default-address checkout prefill. The customer HTTP integration passed on disposable MariaDB, including unauthorized access, cross-account isolation, invalid coordinates, default switching and default reassignment after deletion.
- Reservation `no_show` is now permitted only from a confirmed reservation after its saved duration ends; it is terminal and sends a localized customer notification. The customer HTTP integration verified early rejection, due-time acceptance, notification delivery and no reopening.
- Browser checks do not replace real Windows/Edge LAN/offline, disconnect/reconnect, or restart-recovery acceptance; those remain open.

## Current consolidated branch
- Preserve accessories profiles and their existing template choices.
- Exercise registration, activity/plan isolation, catalog-to-POS and responsive browser flows for 15 activities.
- The demo catalog fixture remains an explicitly14-activity historical sample; it does not define supported registration activities.

## Still open
- Port useful workspace/POS changes from closed PR#17 onto current main without exposing customer email or replacing current sync architecture.
- Complete activity-specific operational tools, variants/options and stock UI.
- Complete delivery zones/fees and driver collection/returns per activity; saved customer addresses are implemented but no zone pricing policy is defined yet.
- Complete preorder-linked reservations and their remaining notification/acceptance flows; no-show lifecycle and notification are verified locally as recorded above.
- Complete registered hotel-room and configured pickup-point ordering journeys.
- Complete customer loyalty and remaining live status/notification acceptance; customer address CRUD and order notification acceptance passed locally as recorded above.
- Verify actual Windows/Edge LAN/offline operation, disconnect/reconnect, restart recovery and durable synchronization on real devices.
- Complete provider refund execution/reconciliation, credit notes and applicable electronic-invoicing acceptance.
- Complete platform-wide AR/EN/FR, security/load and backup/restore acceptance.
- Confirm Hostinger publication and health after the owner's final merge. GitHub Actions account billing block remains separate from local test results.

## Handoff
Keep all subsequent approved work on one reviewed branch/PR for manual owner merge. Do not auto-merge. A merge to main can trigger Hostinger deployment. No production data mutation or migration is authorized by this checklist. The requested temporary feature freeze starts after the owner accepts the final scope; unresolved work must remain explicit.
