# Activity catalog, measured sales and combination stock

Owners/managers manage product details, translations, measurement settings, option values and combination inventory in responsive dialogs. Catalog quick-edit browser prompts are removed; category translation, image URL and destructive deletion use in-page dialogs. The same catalog component serves the dashboard and setup route. Setup no longer repeats the dashboard tool cards; dashboard shortcuts with the same destination are combined into one link. Template load/save errors have Arabic, English and French messages.

## Measured sales

Enable measured quantity in product details and select kg, g, L, ml, m, cm, m² or m³. The stored price and stock use that selling unit; there is no automatic unit conversion. Quantities range from 0.001 to 1000 with three decimal places. Ordinary pieces/packs and restaurant items retain whole-number ordering. Weight in kg and dimensions in cm remain descriptive metadata; dimensions do not automatically calculate a requested area or volume.

Customer cart and shared POS accept measured quantities, show the price unit, and calculate a rounded-cent estimate per line. The server recomputes all unit prices and option adjustments from the catalog. Each line rounds `(unit cents × quantity thousandths) / 1000` to cents before order totals. Fractional product, option and combination debits are transactional; cancellation restores exactly the committed audit quantities. Request-key replay does not debit twice. POS browser drafts retain their existing pending/review synchronization behavior; the separate LAN gateway still rejects fractional event quantities and must not be described as supporting measured gateway sales.

## Combinations

Add translated option groups/values first. Register each sellable selection with an optional SKU and stock. Example: red + S has 2; red + L has 7. Once a product has any combination records, only its registered, enabled exact selections are sellable. Additional option selections also belong to the exact combination. Product, individual option and combination stock caps all apply. Leave the product/option stock blank when only combination stock should constrain sales.

Combination writes lock the parent product and validate every option against that product/tenant and each group's selection rules. Duplicate selections are rejected. Limits: 20 groups, 100 values/group, 500 combinations/product. Combination disabling is a soft operation so historical cancellation can restore its stock; restore does not reactivate it. Re-enable by editing the combination. Option values support in-place name/price/stock edits. Deleting a group/value referenced by a combination makes that selection unsellable until reconfigured; historical order names/prices remain immutable snapshots.

## Migration and release

`0089_catalog_measured_variants.sql` changes existing order-line quantity storage from unsigned integer to unsigned `DECIMAL(12,3)` and adds `catalog_variants`. Existing integer quantities keep their values. No destructive data operation is included. Apply all pending migrations, including `0078_activity_storefront_templates.sql`, before running the new application. A missing template table is not fixed by hiding or translating an error.

Production execution is not part of this change. Before production migration, take and verify a backup, rehearse against a copy, assess ALTER TABLE lock time for the actual order-line volume, and schedule an appropriate window. Rollback application code only after checking new fractional records: converting them back to integers would lose information and is not an acceptable automatic rollback. Keep the expanded schema if reverting application code.

## Verification

Local regression suites exercise decimal precision, unit-mode validation, server rounding, immutable fractional line persistence, replay/conflicting replay, stock races, cancellation restoration, disabled/unregistered combinations, tenant isolation and price/stock authority. Mobile browser coverage creates a measured option and combination through the merchant UI, places a fractional customer order and verifies the persisted remaining combination stock. Existing restaurant, all-activity, locale, currency, image and cart journeys remain in the suite. No production deployment is implied by local verification.
