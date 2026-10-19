-- Public route slugs are independent of stable activity_code and tenant IDs.
-- Do not rename tenant_business_profiles.activity_code or any foreign key.
CREATE TABLE IF NOT EXISTS activity_route_slugs (
 activity_code VARCHAR(64) NOT NULL PRIMARY KEY,
 route_slug VARCHAR(64) NOT NULL UNIQUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO activity_route_slugs (activity_code,route_slug) VALUES
 ('restaurant','restaurant'),('cafe','cafe'),('sweets','sweets'),
 ('grocery','grocery'),('clothing','fashion'),('perfume','perfume'),
 ('accessories','accessories'),('watches','watches'),('gifts','gifts'),
 ('ecommerce','ecommerce'),('carwash','carwash'),('automotive','car'),
 ('laundry','laundry'),('salon','salon'),('publicworks','contracting')
ON DUPLICATE KEY UPDATE route_slug=VALUES(route_slug);
