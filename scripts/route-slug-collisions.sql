-- Read-only preflight BEFORE deploying short activity URLs.
-- Any returned row is a storefront whose old /{slug} path conflicts with a new dashboard.
-- The application exposes those existing storefronts at /s/{slug} without changing UUIDs.
SELECT
 t.id AS tenant_id,
 t.name AS tenant_name,
 t.slug AS current_store_slug,
 CONCAT('/s/',t.slug) AS compatible_public_storefront_path
FROM tenants t
WHERE t.slug IN (
 'restaurant','cafe','sweets','grocery','fashion','perfume','accessories',
 'watches','gifts','ecommerce','carwash','car','laundry','salon','contracting'
)
ORDER BY t.slug,t.id;
