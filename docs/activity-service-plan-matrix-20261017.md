# FOON V2 — Activity-specific plan and service storefront review (2026-10-17)

## Scope
This change corrects feature relevance for all 15 activities without changing saved paid subscriptions, activity overrides, or the existing `0093` migration. No new migration is required for the code change. Product/service records and tenant membership remain isolated.

## Capability matrix
- Dining (restaurant, cafe): tables, waiter, waitlist, restaurant reservation charges, split bills, kitchen and section routing; digital menu limits.
- Product retail (sweets, grocery, clothing, perfume, accessories, watches, gifts, ecommerce): product catalog and its existing digital-menu limit, product variants only when supported by preset.
- Services (carwash, laundry, automotive, salon, publicworks): service/catalog limits and service cards, never waiter/tables/room service/split-bill controls. Automotive additionally supports its existing inventory and booking preset; salon appointment presets; publicworks quotes.
- Shared: storefront/QR listing, POS, delivery, payments, invoices, staff, customer management and meaningful marketing tools, still subject to actual subscription grants and employee permissions.
- Creator account-only features do not appear in merchant plan editing. Previously saved rows are preserved; this filter does not delete them.

## Fixes
- Admin plan editor shows only relevant business features. The separate shared-defaults selection still exposes the complete catalog. Numeric limit fields remain on the catalog limits that are presently enforced, rather than suggesting every on/off feature has an operative count limit.
- Merchant subscription summary also excludes irrelevant features.
- Services use `catalog` as their quota key for direct catalog edits, CSV import and images, while product activities keep `digital_menu`. The catalog quotas still count categories and items separately, including inactive rows.
- Public non-restaurant storefronts already read published `catalog_products` and `catalog_categories`. Cards now identify service vs. physical product, and service activities with a validated business phone show a direct call-to-inquire action. This is **not** an online appointment or quote API and must not be represented as one.
- Server-side restrictions prevent a grant from bypassing clearly unsupported activity-specific modules. The unknown legacy activity-profile behavior is intentionally left unchanged.

## Verification completed and still required
- Local isolated Node test matrix: 5 passed, 0 failed, for 15 activities, service/dining boundaries, automotive capabilities and plan/permission denial.
- A complete Next.js production build, local MariaDB integration suite, customer browser journeys (Arabic/English/French, 320px), service CSV/images tests, and real deployed account acceptance are **not yet verified** in this environment.
- Do **not** merge or deploy on test results above alone. Test free/professional/enterprise plan overrides, enabled/disabled service categories, normal product variants, employee boundaries and existing restaurant POS.
- Before deployment, confirm that live `main` code and `schema_migrations` 0092/0093 match, and ensure a database backup exists.

## Still not implemented by this change
Full customer-driven service appointment booking and online quotation actions, further service-specific workflow UIs, and operational enforcement of every optional numeric feature limit. Those require dedicated APIs, permissions, data models, acceptance tests and possibly separate migrations.
