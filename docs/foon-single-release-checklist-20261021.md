# FOON V2 — consolidated release handoff (2026-10-21)

This is **one reviewable integration batch**, not a statement that all 15 activities and payment providers have passed production acceptance. It builds on `main` after merged PR #175 (creator paid subscriptions, referral commissions and payment hardening) and PR #176 (admin translations and menu-category names). No main merge, production SQL or Hostinger release is performed by this branch.

## Included in this PR

1. Carry forward customer account-scoped saved delivery address/phone/city and GPS, with tenant membership + country isolation and no leaked employee personal account data.
2. Suggest the nearest eligible merchant branch using real customer/branch coordinates; never invent distance when location is missing, and retain customer branch override.
3. Add merchant-managed branch coordinates, owner/manager-only, with additional-branch PIN enforcement. No paid map key is required for coordinate distance. Keep server-side stock, driver and delivery-country enforcement.
4. Make merchant sidebar groups continuously visible **only within their role/feature grants**; do not grant employees customer, merchant owner or admin privileges.
5. Add a single email verification notice with a resend flow and localized errors.
6. Preserve existing pricing, VAT, receipts, operations and POS on `main`. No new payment processing endpoint is claimed in this batch.
7. Fix empty delivery-country lists before SQL construction.
8. Preserve React/Next compatible locale and responsive layout; no hardcoded fabricated customer coordinates.

## Database and safe application order

- The merged finance release requires `0152_creator_subscription_referrals.sql`, `0153_platform_payment_transfer_evidence.sql` and `0154_platform_approved_transfer_claims.sql` in that order and the prerequisite creator migrations `0107` and `0108`.
- The original delivery branch proposed **another 0152**. It is renamed here as **`0155_branch_delivery_locations.sql`**. Apply *after* the finance migrations, once a backed-up staging run succeeds.
- Only the **new filename** is in this consolidation. Do **not** apply the stale `0152_branch_delivery_locations.sql` from PR #177; do not mark either migration in `schema_migrations` unless SQL actually succeeded.
- Perform a read-only comparison of production schema, migration ledger and checkout data, back up first, execute SQL on an isolated staging clone, then follow the approved production change window.
- No seed data, employee accounts, test reservations, live charges or manual backfills belong in this PR.

## Tests and acceptance required before owner's manual merge

- Local from a fresh checkout: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:consolidated`, `npm run test:resources`, `npm run test:activities`, `npm run test:operations`, `npm run build`.
- Run isolated MariaDB migration tests for `0152`–`0155`; test absent tables, duplicate bank reference constraints and branch coordinate update isolation. CI passing does not replace this.
- Browser 320/375/768/1440 px: all three languages; customer saved address with and without GPS, missing country/coordinates, new registration, another tenant, employee account, multiple branches, disabled branch, sold-out item, denied location permission and unavailable driver.
- Test additional-branch PIN before and after unlock, account switch, logout and session expiry; verify no extra staff dashboard access.
- Test restaurant dine-in/table + reservations/preorders and all 15 activity checkout/service paths independently; there is no claim this PR completes those suites.
- Confirm SMTP delivery on a configured test mailbox. Queued verification email is not delivered mail.
- Confirm the precise deployed commit and `/api/health` status in Hostinger *after* manual release; check DB before claiming customer journeys are fixed.

## Out of scope / still requiring separate engineering or acceptance

Provider **live** checkout and refunds/reconciliation, fully automated creator payouts, real hardware Windows Edge/LAN printer and offline restore, 15-activity end-to-end acceptance, asynchronous no-show worker activation, social-provider OAuth publishing, rate-limit/load/security testing and full cross-country shipping acceptance. Leave draft PRs #148/#149/#150/#151/#152/#153/#154/#163/#174/#177 untouched until actual overlap review; do not blindly merge stale branch trees into current `main`.

## Release decision

**Hold manual merge** until local build/test/staging and all rights/financial/data tests pass. This batch was assembled with GitHub source access because the working container has no DNS access to github.com; only dependency-free copied module tests could be exercised locally here. All other evidence must be stated with its actual execution scope.
