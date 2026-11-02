# FOON V2 — Public navigation consolidation, batch #148

## Source audit
Before this change, the home page `app/public-landing.tsx` had an independent FOON header, language/theme controls and footer, while the country-scoped marketplace `app/market/page.tsx` had a different header, no shared appearance control and no matching footer. Published CMS links were deduplicated only on the landing.

## Implemented
- One shared client-facing `PublicSiteHeader` and `PublicSiteFooter` for **home** and **market**. Localized AR/EN/FR labels, a single linked brand, marketplace discovery, key homepage sections, sign-in, free signup, language selector and existing `foon-public-theme` setting. Mobile account link remains accessible.
- Both pages now use `publicFooterPages()` for the same optional published CMS links (including existing `/p/{slug}` pages), with duplicate/reserved/unsafe slug suppression and only one customer-account link.
- A separate `PublicMarketShell` uses the same public light/dark preference and scoped palette. This does **not** change the new account-only three-way system theme in #147 nor branded merchant storefront theme controls.
- No changes to **marketplace country isolation**, SQL `buildMarketWhere`, owner visibility approval/status, product ordering, local currency, registration, customer checkout, plan grants or staff permissions.
- No SQL migrations, API changes, external libraries or new session/account data.

## Verification
- `scripts/public-site-links.test.mjs` covers deduplication, reserved paths, safe localized slug and nonmutation; wired to `test:resources`.
- A Playwright integration checks a **320px** landing -> marketplace flow, exactly one header/footer, customer link, country selection, language switch, saved dark/light preference and horizontal overflow.
- Verify on Windows/Android/iOS for 320px/390px, RTL/LTR, keyboard and menu behavior. Review all published CMS pages under real data, themes and hidden/unpublished stores; ensure no cross-country listing even when the browser cookie differs from the requested country.

**Release policy:** No automatic merge, Hostinger deployment or production database modification. Owner manually merges after independent staging acceptance.
