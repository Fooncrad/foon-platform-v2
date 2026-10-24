-- 0162: privacy-aware unique daily public views for tenant storefronts,
-- published product details and opt-in PUBLIC customer creator profiles.
-- No IP, address, e-mail, user-agent, geo, or plaintext visitor tokens stored.
-- Tenant scope uses '' for creator profiles so uniqueness never depends on NULL.
CREATE TABLE IF NOT EXISTS public_page_visits (
 target_kind ENUM('storefront','restaurant_item','catalog_product','creator_profile') NOT NULL,
 tenant_id VARCHAR(36) NOT NULL DEFAULT '',
 target_id VARCHAR(36) NOT NULL,
 visit_day DATE NOT NULL,
 visitor_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(target_kind,tenant_id,target_id,visit_day,visitor_hash),
 KEY ix_public_visits_tenant_day(tenant_id,target_kind,visit_day),
 KEY ix_public_visits_creator(target_kind,target_id,visit_day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
