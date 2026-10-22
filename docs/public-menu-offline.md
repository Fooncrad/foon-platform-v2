# Public menu browsing without internet

Visit the restaurant's `/<slug>` page online in the same browser first. The saved-menu message appears after the public snapshot has been stored. No device enrollment, employee account, local gateway or database migration is required.

When the browser reports it is offline, the open menu switches to a standalone browsing view. Reloading or reopening the same restaurant URL falls back to that view when the network is unavailable. Search, categories, branch selection and Arabic/English/French work locally. There are no order, payment, login, waiter-call or reservation controls in this view, and no offline customer order queue is created.

Only explicitly selected public catalog fields are saved. Customer email, signed-in state, cart, tables and sessions are excluded. Authenticated HTML and APIs are never cached. Each restaurant has a separate canonical snapshot; URL query parameters are excluded. A confirmed 404/410 removes that restaurant's saved menu. Snapshots expire after seven days, including the photos, and are refreshed by another online visit. Clearing browser storage removes them. A first visit without internet cannot download a menu.

Uploaded FOON PNG/JPEG/WebP pictures can be saved: at most 40 pictures and 20 MB per refresh, with an overall 80-picture/20-menu cache cap. External pictures are not fetched or cached; text remains usable when a photo is unavailable. Offline prices and availability reflect the last saved copy and may change. The browsing layout is deliberately lightweight and independent of Next.js scripts or customer sessions.

Verification: `node --test scripts/public-menu-offline.test.mjs` uses real Chromium and the production service worker; it checks offline navigation/reload, tenant separation, photo fallback, search/branch/language, mobile width, excluded customer data, and 404 invalidation. The merchant browser journey also checks the actual React page's transition to offline browsing and a subsequent offline reload.
