# Activity catalog variants and measurements

The activity catalog now has two responsive native dialogs: product details/measurements and option management. Owners and managers can create named option groups and translated values, require a choice, allow multiple choices, and set a nonnegative price adjustment and optional finite stock for each value. The existing POS/customer ordering engine remains authoritative for pricing, validation, stock debit and cancellation restoration. Group/value deletion is scoped to the product and tenant; immutable order snapshots remain intact.

Templates prioritize activity needs (clothing sizes/colors, grocery weights/packs, perfume capacity, service types). Every template remains editable. Supported selling unit metadata: piece, pack, kg, g, litre, ml, metre, cm, square/cubic metre, hour and service. Weight is stored in kg and dimensions in cm, with up to three decimal places. Measurement writes validate numbers and preserve other existing product attributes. No schema migration is required.

## Boundaries

- Orders still use whole selling-unit quantities. A predefined `0.5 kg` pack is supported through a named option; arbitrary customer-entered fractional quantities, scale integration and automatic per-metre/area/volume pricing are not implemented.
- Independent option stock is not a Cartesian SKU matrix. Color-size combinations requiring distinct shared inventory need a later SKU-combination model.
- Options require the existing `variants` plan entitlement. Group/value writes serialize on the parent product, with caps of 20 groups and 100 values per group.
- A required group with no values prevents ordering. Populate it before offering the item for ordering.
- Existing quick-edit prompts are retained alongside the new complete details dialog. Replacing every legacy category/image/delete prompt and redesigning other activity workflows remain separate work.
- Group/value editing currently uses remove and recreate; previously submitted orders keep their snapshots. Translation fallback uses merchant Arabic content when no translated name is supplied.

## Verification

Regression coverage includes unit/measurement validation, merchant API option creation, cross-tenant rejection, invalid prices/groups, persistence, POS selection/stock rollback/cancellation, and a 320px merchant-dialog to customer-cart browser journey. Run locally with the dedicated disposable `foon_migration_test` database. Deployment and production data changes are outside this PR.
