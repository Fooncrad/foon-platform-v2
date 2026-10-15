# Remaining release work

Updated 2026-10-16. This checklist is not a completion claim. Issue #32 remains open.

## Current consolidated branch
- Add watches as an independent retail registration activity, dashboard/payment/storefront labels and watch-showcase default.
- Preserve accessories profiles and their existing template choices.
- Exercise registration, activity/plan isolation, catalog-to-POS and responsive browser flows for15 activities.
- The demo catalog fixture remains an explicitly14-activity historical sample; it does not define supported registration activities.

## Still open
- Port useful workspace/POS changes from closed PR#17 onto current main without exposing customer email or replacing current sync architecture.
- Complete activity-specific operational tools, variants/options and stock UI.
- Complete delivery zones/fees, driver collection and returns per activity.
- Complete preorder-linked reservations, no-show cancellation and notifications.
- Complete registered hotel-room and configured pickup-point ordering journeys.
- Complete saved customer information, loyalty and live status/notification acceptance tests.
- Verify actual Windows/Edge LAN/offline operation, disconnect/reconnect, restart recovery and durable synchronization on real devices.
- Complete provider refund execution/reconciliation, credit notes and applicable electronic-invoicing acceptance.
- Complete platform-wide AR/EN/FR, security/load and backup/restore acceptance.
- Confirm Hostinger publication and health after the owner's final merge. GitHub Actions account billing block remains separate from local test results.

## Handoff
Keep all subsequent approved work on one reviewed branch/PR for manual owner merge. Do not auto-merge. A merge to main can trigger Hostinger deployment. No production data mutation or migration is authorized by this checklist. The requested temporary feature freeze starts after the owner accepts the final scope; unresolved work must remain explicit.
