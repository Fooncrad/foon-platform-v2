# Legacy NFOOD product add-ons parity — FOON V2

Source of requirements: `Fooncrad/nfood-saas-v2/client/src/components/MenuAddonsPanel.tsx`, `drizzle/schema.ts`, `server/routers.ts`. Target: `Fooncrad/foon-platform-v2`.

## Scope

- **Restaurant menu:** `app/restaurant/menu/addons-panel.tsx` integrates with existing `menuGroups`/`menuValues` resource modules. Includes independent groups, values, Arabic/English/French names, required/optional and single/multiple selection, minimum/maximum, price delta, finite/unlimited stock, image link, sort order, toggle, copy, search, and CSV import/export.
- **Other activities:** the existing shared catalog `app/restaurant/catalog-options.tsx` is already used by merchant catalog pages for café, sweets, grocery, clothing, perfume, accessories, watches, gifts, e-commerce, car wash, laundry, automotive, salon and public works. It now exposes minimum selections, sort order, enable/disable, duplication, image link, search and full CSV export. Its existing `BulkImport` controls support group, value and variant CSV import with resumable progress.
- **Checkout:** public menu/merchant cart/POS all rely on server-side option selection and authoritative price. Catalog activities already lock and debit value/variant stock. Restaurant checkout now debits finite add-on stock within its order transaction and records immutable audit debits for restoration upon cancellation.
- **Isolation:** tenant-scoped reads/writes, owner/manager authorization, branch PIN and plan-entitlement checks remain in the existing endpoints. No request can pass a different tenant ID in a URL/body to bypass header and session authorization.

## Source-to-target features

| Reference behavior | FOON V2 implementation |
| --- | --- |
| Add-on name, grouped by menu item | Restaurant `menuValues/menuGroups`; other activities `catalog_option_values/catalog_option_groups` |
| Required vs. optional, min/max | Enforced at checkout; management inputs on both pathways |
| Add-on price and stock | DB-driven value price; finite/unlimited stock; server transaction debit |
| Enabled/disabled and sorting | Both pathways; disabled options omitted from customer choices |
| Copy and edit | Both management editors |
| Arabic, English, French | Stored in existing explicit name fields/metadata |
| Search and per-product management | Both management editors |
| Import/export CSV | Restaurant per-item add-on CSV plus shared catalog group/value import templates and full-detail export |
| Images | Existing image URL/tenant assets field on each value |
| Pricing and refunds | Server recalculation; restaurant add-on stock restoration on cancellation; shared catalog inventory retains existing behavior |

## CSV caveats and workflow

- The **shared full-detail CSV export** preserves enabled flags, sorting, group minimums, image paths and other management metadata; it is an **archive/export** and is NOT directly accepted by `BulkImport`.
- The **shared import-ready exports** separately generate `groups` and `values` CSVs using precisely the columns accepted by `lib/catalog/import-csv.ts`. Import these in that order. The existing generic importer does not currently accept a minimum-selection or availability column; restore these advanced settings from the editor after import as needed.
- Restaurant import/export uses its own legacy-oriented CSV schema; it is scoped to one selected item, limited to 500 rows / 1 MB. It creates new entries rather than rewriting existing matches; prevent duplicates by reviewing the file before import.
- Export does not migrate **images as binary objects**. Existing URLs remain available; ensure the referenced image asset is reachable.
- Existing restaurant options start with `stock_quantity=NULL` (unlimited), so historical menu items never become unexpectedly unavailable.

## Migration and validation

Run **`npm run db:migrate`** before starting the updated server; migration `0160_restaurant_option_stock.sql` is additive and does not delete rows. Do not mark a migration manually applied unless the SQL has executed.

On a local staging database (not production), run `npm run typecheck`, `npm run test:addons`, `npm run test:resources`, `npm run test:migrations`, and the order/checkout integration suite with a local MySQL/MariaDB fixture.

Required manual acceptance: create a required group and optional group, add multiple selections; check Arabic/English/French names, price changes, stock 0/finite/unlimited, simultaneous checkouts with one stock unit, order cancellation restocking, inactive values, import and export quoting, cross-tenant refusal, tenant staff refusal, and successful customer cart checkout in each activity.

**Status:** The code is on a separate PR branch. The GitHub connector cannot execute repository tests or run DB migrations; none of the above tests, migrations, deployment or merge has been claimed as completed.
