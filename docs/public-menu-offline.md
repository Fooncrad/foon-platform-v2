# Public restaurant menu when the internet is unavailable

Open the restaurant's public URL (`/<slug>` or `/menu/<slug>`) **once while connected** in the same browser/device. Wait for the saved-menu confirmation. After the network disappears, the already-open menu switches to local browsing, and visiting/reloading the restaurant URL uses the snapshot if the network request cannot complete. Browser data must remain intact. No device enrollment or database migration is needed.

## What remains available offline

- Restaurant name, stored cover/logo, public opening hours, address, phone and last-saved status, with a clear **not live** warning.
- Responsive two-column mobile card grid, larger grids on tablets/desktops, optional list view, dark/light theme, horizontal category navigation with category images, branch picker, search and progressive item rendering.
- All public active categories/items retrieved on the initial online visit. Each item retains Arabic, English and French names/descriptions, saved price, previous price, registered quantity, calories, localized nutrition, known allergen labels and a gallery of up to four uploaded photos.
- Translated option group/value names and optional price-difference previews. These **do not** authorize ordering or confirm real-time stock/prices.
- Arabic RTL, English LTR and French LTR; language may be switched without a network connection. The last saved language is the default at offline launch; numeric prices use Latin digits.

Orders, cart submission, reservations, payments, user registration, waiter calls and API requests **are never queued or replayed offline**. The offline page is an isolated browsing snapshot and never includes account/session state, customer email, cart, order history or dining tables.

## Media and storage restrictions

Only same-origin FOON-uploaded images matching `/api/restaurant/assets/<UUID>` can be stored; external imagery is not cached. Up to **160 images / 60 MB per refresh** (4 MB per image) and **320 images / 20 menus globally** are retained in the service-worker Cache Storage. Cache entries expire after seven days and may be evicted earlier if the browser runs out of storage. The online page warns when some listed FOON images could not be saved. Cards and text details stay usable even without their photos.

Menus remain isolated by canonical store slug; query strings do not create new copies. Invalidated public restaurant pages returning 404/410 have their snapshots removed. Private pages, authenticated HTML and API responses are never persisted in the menu cache. First-time offline access cannot download unseen menus. This feature does **not** provide offline POS/local gateway ordering, and does not preload non-restaurant storefront pagination.

## Validation

Run `node --experimental-strip-types --test scripts/public-menu-offline.test.mjs` with installed Playwright Chromium. The test covers worker-driven offline reload, 320px viewport, tenant separation, cached gallery images, option previews, Arabic/English/French, search, branch filtering, exclusion of customer data, and deletion on an online 404.

For manual device testing: visit a public restaurant while online and wait for its saved notice; open item details and gallery; enable DevTools > Network > Offline; confirm the same saved content, category/branch/search and all three languages work; refresh and reopen the exact URL; restore network and confirm the live menu refreshes. A full browser cache/storage purge intentionally removes the saved snapshot.
