-- Additive: import retries and optional per-account media policy. No existing data changed.
CREATE TABLE IF NOT EXISTS media_account_limits (
 user_id VARCHAR(36) NOT NULL PRIMARY KEY,
 max_files INT NOT NULL,
 max_storage_mb INT NOT NULL,
 max_file_mb INT NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_media_account_limits_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS catalog_import_batches (
 tenant_id VARCHAR(36) NOT NULL,
 request_key VARCHAR(100) NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 result JSON NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,request_key),
 CONSTRAINT fk_catalog_import_batches_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
