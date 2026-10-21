-- 0105: optional, free GPS-derived delivery radius per tenant.
-- Apply once to staging before deploying the associated API. No paid map service required.
CREATE TABLE IF NOT EXISTS tenant_location_settings (
 tenant_id VARCHAR(36) NOT NULL PRIMARY KEY,
 delivery_mode ENUM('manual','radius') NOT NULL DEFAULT 'manual',
 latitude DECIMAL(10,7) NULL,
 longitude DECIMAL(10,7) NULL,
 radius_km DECIMAL(7,2) NULL,
 outside_message VARCHAR(240) NULL,
 google_analytics_id VARCHAR(32) NULL,
 facebook_pixel_id VARCHAR(25) NULL,
 ai_assistant_requested BOOLEAN NOT NULL DEFAULT FALSE,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_tenant_location_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
