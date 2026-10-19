-- Public marketplace listing controls. Storefront URLs remain available to
-- customers who already have the direct link; this only controls /market.
ALTER TABLE tenants
 ADD COLUMN IF NOT EXISTS market_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN IF NOT EXISTS market_visible_from DATETIME NULL,
 ADD COLUMN IF NOT EXISTS market_visible_until DATETIME NULL,
 ADD COLUMN IF NOT EXISTS market_sort_order INT NOT NULL DEFAULT 0;
