-- Public marketplace listing controls. Storefront URLs remain available to
-- customers who already have the direct link; this only controls /market.
ALTER TABLE tenants
 ADD COLUMN market_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN market_visible_from DATETIME NULL,
 ADD COLUMN market_visible_until DATETIME NULL,
 ADD COLUMN market_sort_order INT NOT NULL DEFAULT 0;
