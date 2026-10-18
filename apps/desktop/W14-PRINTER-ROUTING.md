# FOON Windows W14 — Category-based printer routing, all merchant activities

**Status:** Pure, isolated routing policy only. All seven tests passed on local Node 22; source/test git blob hashes verified. Physical device discovery, queue persistence, Windows spooler and actual print are NOT integrated yet.

## Authoritative print rules

- Route by trusted category identifier, never product name, SKU or untrusted client-supplied category/printer field.
- A category belongs to a tenant and branch; an enabled section printer must belong to the identical tenant and branch. Missing or duplicate assignments fail closed.
- One print job per printer for the same production event, grouping the items of all categories assigned to it. A stable SHA256 job ID enables downstream durable deduplication; this pure module does not provide durable printer queueing.
- Supports ALL merchant activity codes by requiring no restaurant-only or food-specific assumptions.
- Separate merchant customer receipt printer, not reused for section/KDS jobs.
- Separate PLATFORM ADMIN printer for subscription invoices, not reused for merchant jobs.
- Receipt footer defaults to an empty string and may be configured; does not hardcode the disturbing 'non-tax invoice' disclaimer. Regulatory/tax statements must follow applicable invoice rules when actually printing.
- The printer business policy does not accept or expose cloud tokens, database URLs or keys and does not touch saved W05/W06 SQLite or local W08/W10 MariaDB.

## Where the source lives

- scripts/foon-category-print-policy.mjs
- scripts/foon-category-print-policy.test.mjs

## Before actual store printing

1. Add scoped category-printer configuration to the merchant dashboard with validation for branch and printer role.
2. Add a durable local print queue and ACK/idempotency by production event; never claim exactly-once physical printing based on SHA256 alone.
3. Implement a private Windows native spooler/driver adapter and printer discovery/health. Avoid distributing proprietary JS sources in installer.
4. Create receipt templates and tax-compliant invoices, and a separate platform admin print route.
5. Test disconnect/reconnect, duplicate events, printer outage, permissions, kitchen sections, all activities and KDS in an isolated staging environment.

No automatic deploy or merge, no real printer operations, no production connection.
