# FOON V2 — unified free location, delivery-radius and integrations

## Installation order
1. Back up the production database. Apply `migrations/0105_tenant_free_location_settings.sql` to a staging database first, verify the table/foreign key, then production during a maintenance window **before** deploying this code.
2. Configure Admin → Settings → reCAPTCHA / AI / tracking consent. Do not paste private provider credentials into the UI. The UI stores a **public site key** and the requested provider/model only.
3. Merchant owner or manager → Customer storefront controls → Free location and delivery radius. This appears for restaurants, cafés and other activities via the shared merchant workspace. Each tenant has an independent row; staff without an owner/manager grant have no edit access.
4. Choose **Manual** (default, no GPS required) or **Within radius**. Provide the business origin Latitude, Longitude and distance in km, then save. Click *Use my location* from HTTPS on the business device with explicit browser permission, or enter coordinates yourself.
5. Open OpenStreetMap from the settings page to review the marker. The map link is opt-in; **FOON does not embed an external map script or require Google Maps keys**.

## Deliveries
- For catalog checkouts using `POST /api/customer/orders`, the backend checks radius before calling `createOrder`. Missing customer GPS in radius mode => `DELIVERY_GPS_REQUIRED`; outside zone => `DELIVERY_OUT_OF_RANGE`. On rejected orders, the transaction rolls back. The customer can use a different delivery method or ask the store to change its radius rule.
- Distance is a geodesic approximation (Haversine), not driving distance; GPS values are user-provided and can be spoofed, so it is **not proof of street-level delivery eligibility**.
- Existing countries, plan entitlements, and driver availability restrictions remain in place.
- Customer GPS capture via `navigator.geolocation` is already in the catalog cart and requires a deliberate click. **A formatted address is still manual unless `GOOGLE_MAPS_GEOCODING_API_KEY` is configured separately**. Without the paid key, latitude/longitude can still be submitted while city and street are entered manually.
- The location center is per merchant (tenant), not branch-specific yet. With multiple branches, set a suitable center or leave the tenant in manual mode until branch-specific zones are introduced. Other order entry routes (e.g., offline POS and kitchen-entered orders) are not subject to browser GPS enforcement.

## Analytics and security
- Merchant: optional GA4 measurement ID and Meta Pixel ID are stored tenant-scoped and syntactically validated. **Tracking scripts are not automatically injected**, and analytics cannot be described as collecting real traffic yet. Consent management and provider integration are still required.
- Merchant: AI assistant option is an activation request flag, not an operating chatbot.
- Admin: reCAPTCHA public site key/requested state, AI provider/model and tracking consent policy. These do **not** activate Google verification or external AI on their own. Actual enforcement needs server-side validation and rate-limit tests; secret values `RECAPTCHA_SECRET_KEY`, `OPENAI_API_KEY` are read from the environment for readiness checks and never exposed as values in responses.
- Security: tenant membership checks protect both location read/write; admin integration route is restricted to platform roles with same-origin checks on writes. Records are not shared between different countries/tenants.

## Verification before publishing
```powershell
npm run test:free-location
npm run test:resources
npm run typecheck
npm run build
```
Run staging integration/browser tests for Riyadh coordinates, blocked GPS permission, missing coordinates, inside/outside radius, disabled delivery, a foreign-country order, multiple tenants, owner vs staff access, and light/dark layouts at 320/375/768/1440px. Do not use GitHub Actions as the sole release gate.
