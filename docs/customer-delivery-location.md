# Customer delivery location and address reuse (FOON V2)

Introduced in the post-#129 follow-up branch.

## Runtime configuration
- To enable automatic address lookup from optional customer GPS coordinates, provision `GOOGLE_MAPS_GEOCODING_API_KEY` **server-side** in Hostinger. Enable Google's Geocoding API and billing for that project, restrict the key to the Geocoding API and apply an appropriate project-wide quota. Do not expose the key via `NEXT_PUBLIC_*` or commit it to the repo.
- Without the key, the customer can still enter city/address manually. Saving a manual address does not depend on the geocoder.
- The request uses the customer's explicit "Use my location" action and browser permission. Coordinates are transmitted server-side to Google's geocoding endpoint only after that action. No geocoder results are cached by FOON.
- The API returns only normalized country code, city, address, and a status; no raw Google response or secret is returned. It checks store-allowed countries before suggesting an address.
- The endpoint is authenticated and has a best-effort process-local limit of three requests per customer per minute. **This is not a distributed rate limit**: configure provider-side spending limits and quotas for multi-instance production deployments.
- If the service fails, is unavailable, or returns a country the merchant cannot serve, the checkout stays manual and the customer must still explicitly confirm the address.

## Customer addresses
- On successful catalog delivery orders, the saved address is updated/reused or inserted into `customer_delivery_addresses` within the order transaction and the customer-row lock. If an account has existing addresses, the new one is not silently set as the default; on an empty address book, it becomes the initial default.
- Address reuse selects saved addresses only in the merchant's local or **approved** delivery countries.
- The address book has a 500-character street field; for 501–900 characters, checkout stores the continuation in `delivery_notes` with a dedicated marker and reconstructs it on the storefront. Existing customer-provided notes without the marker are not appended to the address.
- The merchant's city can be edited and autosaved in the customer-interface control panel, using the existing `tenant_public_controls.delivery_city` column.
- No additional SQL migration is necessary beyond #129 (0102 and 0103) and the earlier address book migration 0095.

## Validation and caveats
Run `node --experimental-strip-types --test scripts/customer-delivery-address-sync.test.mjs scripts/reverse-geocode.test.mjs`, `npm run typecheck`, `npm run build` and relevant database/browser integration checks in an environment with dependencies and a staging database. Verify both local and internationally approved shipping, denied location permission, provider errors, different saved-address countries, and repeated checkout.
