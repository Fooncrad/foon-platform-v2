# FOON V2 — UX foundation baseline (20 October 2026)
  
Scope: platform-wide roles and 15 activities. Baseline is from the current `main` code, not a claim of completed visual/role acceptance. This document supports the **incremental** platform UX plan without changing checkout, permissions, API, prices or subscription rules.

## Actual entrypoints and layouts

| Context | Current code entrypoint | Verified source behavior | Gap to investigate |
| --- | --- | --- | --- |
| Public platform | `app/page.tsx` → `app/public-landing.tsx` | Landing includes discover/market, account entry, language/theme and published CMS links | Align navigation/footer with a shared visual contract without duplicate links |
| Activity storefronts | `app/[slug]/page.tsx` → `activity-storefront.tsx` | Retail/service catalog filtered by activity; mobile dock exists; AR/EN/FR and 2-mode theme toggle | Check top/dock keyboard overlap, service-specific actions, link visibility by permissions |
| Customer account | `app/customer/page.tsx` | Account, orders, reservations, notifications, linked stores; separate existing address editor `delivery-addresses.tsx` | **Before this PR:** address editor not mounted; profile appeared before daily order work; no shared bottom navigation or direct order/address links |
| Merchant/staff | `app/restaurant/page.tsx`, `app/restaurant/layout.tsx`, merchant operations/client files | Shared workspace with per-activity tools and permission checks; role scoped APIs | Inventory sidebar groups, staff role view, daily priorities and unfinished onboarding by each activity |
| Platform admin | `app/admin/layout.tsx`, `app/admin/page.tsx` | Distinct admin shell; client theme persists `light`/`dark` | 3-way device preference and mobile bottom layout, ensure all admin subpages consistent |
| Cross-page base | `app/layout.tsx`, `app/globals.css` | Root HTML language and RTL; global CSS contains public/admin/customer style regions | Central semantic design tokens, contrast, no flash at hydration, consistent components |

## Activity and account inventory

`lib/platform/customer-checkout.ts` explicitly defines these distinct customer operations, **not** a universal cart: cart for restaurant, cafe, sweets, grocery, clothing, perfume, accessories, watches, gifts, ecommerce; service cart for laundry; appointment for carwash, salon, automotive; quotation for publicworks. Existing login, order/customer association, price rules and permissions stay untouched.

Account surfaces must remain separate: platform admin; owner/manager; employee with role, branch and grants; customer (personal customer routes must never become staff entrypoints). Dynamic entitlement/tenant visibility must continue to gate actual links and operations. Role-by-role visibility validation still pending.

## Prioritized gaps from the supplied plan

- **P0 navigation (in progress):** Customer first: expose orders, reservations, saved addresses and account settings through five clear mobile anchors; provide footer; move tasks ahead of profile editing. Next, audit merchant/admin/public navigation for duplicates and consistent active section/role context.
- **P0 customer account:** Existing profile/order/notification/addresses are real features; do not invent favorites, customer support ticket queues, or security settings unless backend paths are present and permission tested.
- **P0 merchant/admin:** Group long sidebars by daily operation, catalog, team, customer, reporting, settings, only for granted activity/role. Record actual current categories before changing client nav.
- **P1 theme:** Current storefront/admin each support only light/dark in different implementations; root and customer need a measured 3-way light/dark/system theme strategy, account preference synchronization only if existing data supports it. Avoid deploying untested global CSS overrides.
- **P1 accessibility:** Confirm 320/390/768 desktop screens, keyboard focus and dialogs, safe areas, AR/EN/FR, Latin digits, text zoom and screen readers. Do not infer success from static source code.
- **P2 measurement:** Define task success, time-to-task, error recovery and layout-performance baselines; implement measurement with consent and existing tools only, before adding data collection.

## This small PR's scope / acceptance

Actual changes: customer wayfinding helper, accessible client bottom nav (five text+icon links; current location); actual delivery-address component mounted; account page order section prioritized; semantic anchor IDs and footer; safe-area/padding and focus styles; source tests and browser checks for mobile 320px, no horizontal overflow and functioning address navigation.

Acceptance still needs independent Windows/Node24/MariaDB and iOS/Android UAT. Confirm navigation doesn't cover inputs when the keyboard opens, stable back/forward behavior, direction switching and authenticated customer vs staff denial. Other roles and full system/light/dark theme remain **not yet implemented** in this PR.

No SQL migration, no new dependencies, no auth or checkout API changes. GitHub PR for manual owner merge only. Do not deploy to Hostinger or alter production data automatically.
