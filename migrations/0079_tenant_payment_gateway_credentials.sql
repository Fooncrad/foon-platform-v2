-- Separate encrypted gateway configuration from existing checkout enablement.
-- Electronic payment stays disabled until a verified provider adapter is deployed.
CREATE TABLE IF NOT EXISTS tenant_payment_gateway_credentials (
 tenant_id VARCHAR(36) NOT NULL,
 scope_key VARCHAR(80) NOT NULL,
 provider VARCHAR(40) NOT NULL,
 mode ENUM('test','live') NOT NULL DEFAULT 'test',
 credentials_ciphertext TEXT NULL,
 secret_key_set BOOLEAN NOT NULL DEFAULT FALSE,
 webhook_secret_set BOOLEAN NOT NULL DEFAULT FALSE,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,scope_key),
 CONSTRAINT fk_payment_credentials_scope FOREIGN KEY(tenant_id,scope_key)
 REFERENCES tenant_payment_settings(tenant_id,scope_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
