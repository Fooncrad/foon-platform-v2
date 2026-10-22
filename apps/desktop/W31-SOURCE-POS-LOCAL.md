# FOON W31 — Original POS source DOM hierarchy over local-safe engine

Based on W30, which includes **all seven unchanged FOON merchant source CSS layers** pinned from `main` at `5e1b369d660b197bf645cc52dc7de7f01d07443a`.

## Delivered to W31 branch

- Local POS uses the original `OrderWorkspace` POS component class hierarchy: `restaurantPosWorkspace`, `restaurantPosModern`, `restaurantPosCatalog`, `restaurantPosCheckout`, `restaurantPosSectionHeading`, `restaurantPosBrowse`, `restaurantPosCategories`, `restaurantPosProduct`, `restaurantPosItemCount`, `restaurantPosCartCount`.
- Menu source cards display name, locally cached price, and an Add button connected to the existing W27 cart and SQLite-backed order API; category chips and case-insensitive search work on scoped local catalog, and category/nav keyboard focus survives background refresh.
- The owner/cashier checkout pane shows **only takeaway**, supported by current W27 local acceptance. It does not pretend that dine-in, delivery, reservation tables, payments, printers, invoices or discounts work.
- Expanded station health/pending data is behind a collapse/expand button; pending changes remain local. The KDS view hides the entire POS pane.
- Arabic, English and French UI labels; responsive cards, sticky cart on desktop, mobile layout and dark mode text.
- Cloud-unconfirmed entries always say **not confirmed** when `offline-only` is enabled.
- Static source contract `node scripts/test-w31-pos-ui.mjs`, which imports the seven-file source hash test from W30. Static source inspection also confirmed client JS parses.

## Safety and limitations

This is **not pixel-level 100% FOON parity**. The implementation uses the source structure and exact vendor CSS with lightweight local DOM adapters. The real React `OrderWorkspace` includes many nonportable cloud-specific components and server workflows. A full React/Next migration plus identical font/icon/media components and Windows browser screenshot comparison is still required. Never claim functional parity with production.

This is **offline-only development**. It neither connects to cloud nor changes the MySQL production system. It does not extend the original seven-hour offline lease, bypass expired authorization, package merchant EXE, or alter merchant devices. The next release gates include original React portal/checkout integration, secure Windows source packaging, device enrollment, native key storage, and signed renewed offline grants.

## Windows same-folder delivery

Update these file paths only inside the existing `SOURCE-W28`:

- `scripts/edge-console/index.html`
- `scripts/edge-console/console.js`
- `scripts/edge-console/w28-shell.css`
- `scripts/edge-console/translations.js`
- `scripts/test-w31-pos-ui.mjs`

Stop the W28 process first. Keep W27 `SOURCE`, `W28-TOOLS`, all database WAL/Outbox files, `%LOCALAPPDATA%\FOON\W28-DEVELOPMENT-ONLY`, and saved credentials **untouched**. Take a rollback snapshot of selected UI files. No merging `main`, no CI deployment.
