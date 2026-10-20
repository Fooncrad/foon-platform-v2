# FOON V2 — workspace appearance, batch #147

## Scope
A single **device-local** preference controls the account-only shells for **platform admin**, **merchant/employee dashboard**, and **customer account**. It does not change the public landing, a tenant's branded storefront, customer/public catalog, QR menu, logo, cover, restaurant dark theme, media studio or independently configurable tenant appearance.

## Contract
- Storage: `localStorage["foon-workspace-theme"]`; values: `system`, `light`, `dark`. Invalid or missing values behave as `system`.
- `system` follows `prefers-color-scheme: dark`, including real-time device changes while the page is open; `light` and `dark` override the device appearance.
- `useSavedPreference` listens to the local `foon-preference-change` event and browser `storage`, so tabs and independent account shells can receive changes on the same device/browser profile.
- The previous admin-only `foon-admin-theme` light/dark setting is migrated once **only if the new shared key has never been set**. No database changes or account-profile persistence claimed.
- The UI is a single AR/EN/FR labeled select in each of the three account shells (minimum 44px tap target), with scoped palette variables and no change to activity accent colors, membership, RBAC, sessions, checkout or payments.
- The theme hook uses a light SSR snapshot until the client reads local storage/device preferences. Avoid asserting zero initial theme flash; future cookie-backed initial resolution could address it if approved.

## Acceptance checklist
1. Visit all three account shells and choose `Dark` then `Light`, then `Use device`. All three should use the same preference in the same browser profile after navigation and reload.
2. With `Use device` selected, switch OS/browser color preference while staying on the page; the selected effective theme must update without reloading.
3. Test AR RTL, EN LTR, FR LTR on 320px, 390px, 768px and desktop. Verify text, form placeholders, focus outlines, table headers, stock badges and safe width. Sidebar/drawer, POS, KDS, printer controls and staff-grant hiding must remain unaffected.
4. Check the admin legacy preference migration and cross-tab `storage` updates.
5. Open a customer-facing tenant storefront with a separate store theme configured; confirm the storefront palette does not change when switching the account-shell preference.
6. Validate keyboard, high contrast and mobile platform light/dark in Windows + Android/iOS staging.

## Test coverage
- `scripts/workspace-theme.test.mjs` validates modes, multilingual labels, deterministic device-mode resolution and invalid-value rejection.
- Extended `scripts/merchant-dashboard.browser.test.mjs` exercises the three-account-surface select and device preference responsiveness with Chromium and a disposable MariaDB environment.
- GitHub automated checks are supplemental, not an independent physical-device release sign-off.

No schema migration, no server endpoints or new npm dependencies. Manual PR merge/release policy remains in force.
