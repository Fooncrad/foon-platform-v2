-- Separate gateway binding for standalone service invoices without restaurant_orders.
-- NEVER accept a browser-supplied payment ID as an authenticated financial receipt.
-- Only a trusted server-side provider adapter may register the provider payment ID.
CREATE TABLE IF NOT EXISTS tenant_service_invoice_payment_attempts (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 scope_key VARCHAR(80) NOT NULL,
 invoice_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NULL,
 provider VARCHAR(40) NOT NULL,
 mode ENUM('test','live') NOT NULL,
 provider_payment_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
 amount_minor BIGINT UNSIGNED NOT NULL,
 currency CHAR(3) NOT NULL,
 status ENUM('pending','paid','test_completed','review') NOT NULL DEFAULT 'pending',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_service_payment_provider_global (provider,mode,provider_payment_id),
 UNIQUE KEY uq_service_payment_invoice_mode (tenant_id,invoice_id,mode),
 KEY ix_service_payment_invoice_status (tenant_id,invoice_id,status),
 CONSTRAINT fk_service_payment_invoice FOREIGN KEY(tenant_id,invoice_id) REFERENCES restaurant_resources(tenant_id,id),
 CONSTRAINT fk_service_payment_settings FOREIGN KEY(tenant_id,scope_key) REFERENCES tenant_payment_settings(tenant_id,scope_key),
 CONSTRAINT fk_service_payment_branch FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
