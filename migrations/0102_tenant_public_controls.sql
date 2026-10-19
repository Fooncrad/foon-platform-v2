-- Tenant-controlled public experience. Absence of a row means legacy defaults stay enabled.
CREATE TABLE IF NOT EXISTS tenant_public_controls (
 tenant_id VARCHAR(36) NOT NULL PRIMARY KEY,
 controls JSON NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
