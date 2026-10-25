-- Anonymous, per-day deduplicated public visits. No raw IP or UA is retained.
CREATE TABLE IF NOT EXISTS public_visit_daily (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('storefront','product','profile') NOT NULL,
  tenant_id VARCHAR(64) NOT NULL DEFAULT '',
  resource_id VARCHAR(128) NOT NULL DEFAULT '',
  owner_user_id VARCHAR(64) NOT NULL DEFAULT '',
  visit_date DATE NOT NULL,
  visitor_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_public_visit (kind, tenant_id, resource_id, owner_user_id, visit_date, visitor_hash),
  KEY idx_visit_tenant (tenant_id, kind, visit_date),
  KEY idx_visit_profile (owner_user_id, kind, visit_date),
  KEY idx_visit_resource (tenant_id, resource_id, kind, visit_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
