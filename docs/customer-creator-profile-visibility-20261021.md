# FOON V2 — Customer creator profile, visibility and portfolio

## Ownership model
A creator is an ordinary **customer account** that has opted into a personal creative profile, not a restaurant, store, business activity, platform admin or employee role. The creator profile is keyed exclusively to `users.id`, with no tenant ID and no merchant subscription prerequisite. Historic or suspended employee memberships, merchant owner memberships and platform administrator accounts may not create a creator identity.

## Public/private privacy
- `0107_customer_creator_profiles.sql` adds profile and portfolio tables. The profile is **private by default**.
- A customer can choose **Public** or **Private** explicitly in `/customer/creator`, and update it later.
- Public profiles appear at `/creators/{handle}` and in the public `/creators` directory. The private profile, private avatar and all privately held portfolio images are **404**, even when a visitor knows the exact URL.
- Public media endpoints validate profile visibility and account eligibility again on **every request** and return **no-store**. Private account library, invoices, orders, phone and email are never publicly exposed.
- The portfolio contains **only personal-library images explicitly selected by the customer** (up to 24) and never auto-publishes the full image library.
- Switching back to private hides profile and public media links. Users should still be aware third parties could have saved copies or screenshots while the profile was public.

## Endpoints and UX
- `GET/PUT /api/account/creator-profile`: read/update own profile and visibility; `POST/DELETE` add/remove one's own published images. Session, same-origin checks, ownership, input bounds, unique handle and limits enforced.
- `/customer/creator`: personal profile editor and selected portfolio; entry link added to the customer dashboard. Arabic, English and French UI.
- `/creators`: public directory; `/creators/[handle]`: public profile.
- `/api/creators/[handle]/avatar` and `/api/creators/[handle]/media/[id]`: public image retrieval only while opted in.

## What remains separate and NOT claimed complete
This implementation completes the **initial customer creator profile + opt-in visibility + curated-image publication path in code**, not a fully completed creator economy. The content marketplace, content pricing, customer purchases of media, creator payments/payouts, approval workflow, watermark processing, moderation, reporting, SEO/abuse controls, large-volume directory pagination and provider social/OAuth publishing require separately implemented and tested services. Do not mark these as running based on a merchant plan feature flag.

## Release/verification
1. Confirm backup; review and apply migration **0107** to disposable staging/test **before deploying** the routes; confirm schema and indexes; only then apply under approved production release.
2. Locally run `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`, `node --experimental-strip-types --test scripts/customer-creator.test.mjs`.
3. With `DATABASE_URL` constrained to local `mysql://...@127.0.0.1:3306/foon_migration_test`, run `node --test scripts/customer-creator.integration.test.mjs` after an isolated build and migration.
4. Manually exercise public/private toggles in customer browser, anonymous public browser, suspended staff, merchant owner, change username, empty avatar, 320px, AR/EN/FR and image removal.
5. Only after verification should the PR be merged manually and deployed to Hostinger. A merge alone is not deployment. **No production data or migrations were touched in this change.**

## Social links + QR extension (2026-10-21)
- Migration `0108_customer_creator_social_links.sql` is additive and must run **after 0107**. It stores at most one URL for each of 12 platforms per customer profile; no merchant plan or tenant ownership is involved.
- The profile editor includes **Instagram, TikTok, Snapchat, YouTube, X, Facebook, WhatsApp, Telegram, Threads, LinkedIn, Pinterest and personal website** with graphical iconography.
- Links are explicitly entered/edited by the customer and validated on every write (HTTPS, expected official domain and profile/contact path, input size, no duplicate platforms, no localhost/private IP for custom web links). Saved links are revalidated before public rendering. WhatsApp phone link is optional and not derived from the user's private account phone.
- The public creator profile displays modern icon cards for selected platforms. A private profile exposes neither links nor its QR image.
- First-party `qrcode` (already in `package.json`) generates a genuine SVG from the canonical `APP_URL` origin at `/api/creators/[handle]/qr`. The route repeats checks for **public visibility, active account, non-employee/non-owner/non-admin status**, responds with no-store and has no third-party image-provider dependency.
- An opted-in public customer can **download QR and copy the profile link** in the personal editor. Anonymous users see the QR directly on the public profile.
- Switching the profile back to private yields 404 for the public profile and QR immediately; an already-saved QR code can still be scanned but will lead to the blocked private profile.
- Tests added: `scripts/creator-social-qr.test.mjs`; `scripts/customer-creator.integration.test.mjs` now checks saving social links, rejecting malicious URLs, public rendering, real QR SVG response and privacy revocation.
- Do not confuse static source checks with completed Node/Next/MySQL/browser tests. Production is untouched by the PR.

**Migration order:** 0107 then 0108 on isolated test/staging; after successful tests and manual release approval, apply both to production *before* deploying routes. Recording a migration in `schema_migrations` must happen only after its SQL actually succeeded. `APP_URL` should be configured with the canonical public host so QR encodes the real website, not a test host.
