# FOON V2 — Africa coverage and marketplace discovery (2026-10-17)

## Countries and currencies
- Expanded the existing country catalog from 54 to 90 entries.
- Covers all 54 African countries that are members of the UN. This does not reclassify dependent territories or politically disputed territories as UN member states.
- Key new entries: Mali (ML), Burkina Faso (BF), Niger (NE), all XOF (West African CFA franc).
- Includes West/Central/East/Southern Africa countries missing from the prior catalog, with ISO two-letter country codes and ISO 4217 currency codes, and Arabic/English/French labels.
- Zimbabwe uses current ISO code ZWG (Zimbabwe Gold), not discontinued ZWL.
- Registration and activity onboarding share the same `supportedCountries` / `currencyForCountry` utilities; extra countries accept manually entered region/city when there is no preset city list. The country picker no longer clips searchable countries to 54.
- No database schema changes or new migration is required to support these country codes.

## Marketplace
- Search by specific activity among the 15 business activities, preserving optional restaurant/store grouping and country scope.
- Deterministic newest-first pagination, 24 tenant cards per page, no hidden 100-tenant ceiling; bound and validate requested page, country, and activity.
- SQL prepared values + LIKE escaping ensure typed search terms are matched literally rather than being treated as SQL wildcards.
- Previous/next links retain selected country, activity, and query. Country selector stays explicit on a first visit without geo hints.

## Verification
- `npm run test:activities` includes `scripts/african-market.test.mjs` covering 54 codes, nonduplicate country entries, localized names/currencies, country/activity filter validation, literal search, and page links.
- Production Next.js build and all integration/browser suites must pass before merge; do not run destructive database tests on production.
- No GitHub Actions tasks were manually triggered; ordinary PR workflows may run automatically.

## Out of scope
- In-country gateway availability, banking compliance, taxes, currency conversion and local financial support are not implied by adding a country and its ISO currency. Payment providers must be individually configured and verified by the merchant/platform for each country.
- No production mutation or automatic merge/deploy.
