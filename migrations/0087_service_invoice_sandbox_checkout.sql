-- Durable merchant-initiated sandbox checkout for a standalone service invoice.
-- A recorded attempt is committed before contacting the payment gateway.
CREATE TABLE IF NOT EXISTS tenant_service_invoice_checkouts (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 scope_key VARCHAR(80) NOT NULL,
 invoice_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NULL,
 requested_by VARCHAR(36) NOT NULL,
 provider VARCHAR(40) NOT NULL,
 mode ENUM('test','live') NOT NULL,
 amount_minor BIGINT UNSIGNED NOT NULL,
 currency CHAR(3) NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 state ENUM('creating','uncertain','ready','review') NOT NULL DEFAULT 'creating',
 provider_payment_id VARCHAR(180) COLLATE utf8mb4_bin NULL,
 hosted_url VARCHAR(2048) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_service_checkout_invoice_mode (tenant_id,invoice_id,mode),
 KEY ix_service_checkout_scope (tenant_id,scope_key,state),
 CONSTRAINT fk_service_checkout_settings FOREIGN KEY(tenant_id,scope_key) REFERENCES tenant_payment_settings(tenant_id,scope_key),
 CONSTRAINT fk_service_checkout_invoice FOREIGN KEY(tenant_id,invoice_id) REFERENCES restaurant_resources(tenant_id,id),
 CONSTRAINT fk_service_checkout_branch FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id),
 CONSTRAINT fk_service_checkout_actor FOREIGN KEY(requested_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
