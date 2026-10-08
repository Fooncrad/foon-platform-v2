-- Payment settings belong to each tenant; branch overrides are optional.
-- No gateway credentials are stored until encrypted secret storage is implemented.
CREATE TABLE IF NOT EXISTS tenant_payment_settings (
 id VARCHAR(36) PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NULL,
 scope_key VARCHAR(80) NOT NULL,
 provider VARCHAR(40) NOT NULL DEFAULT 'manual',
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 currency CHAR(3) NOT NULL DEFAULT 'SAR',
 merchant_reference VARCHAR(120) NULL,
 public_key VARCHAR(255) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_tenant_payment_scope(tenant_id,scope_key),
 KEY ix_tenant_payment_branch(tenant_id,branch_id),
 CONSTRAINT fk_tenant_payment_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_tenant_payment_branch FOREIGN KEY(branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
