-- FOON V2 - batch 126 - clean activity URLs.
-- Stable activity_code values, tenants.id, memberships and all foreign keys remain unchanged.
-- Apply through scripts/migrate.mjs or phpMyAdmin. Safe to repeat.
CREATE TABLE IF NOT EXISTS activity_route_slugs (
 activity_code VARCHAR(64) NOT NULL PRIMARY KEY,
 route_slug VARCHAR(64) NOT NULL UNIQUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO activity_route_slugs (activity_code,route_slug) VALUES
 ('restaurant','restaurant'),
 ('cafe','cafe'),
 ('sweets','sweets'),
 ('grocery','grocery'),
 ('clothing','fashion'),
 ('perfume','perfume'),
 ('accessories','accessories'),
 ('watches','watches'),
 ('gifts','gifts'),
 ('ecommerce','ecommerce'),
 ('carwash','carwash'),
 ('automotive','car'),
 ('laundry','laundry'),
 ('salon','salon'),
 ('publicworks','contracting')
ON DUPLICATE KEY UPDATE route_slug=VALUES(route_slug);
