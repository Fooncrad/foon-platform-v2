-- Tenant-bound webhook routing and minimal durable receipts; no raw customer/card payloads.
CREATE TABLE IF NOT EXISTS tenant_payment_webhook_endpoints (
 tenant_id VARCHAR(36) NOT NULL,
 scope_key VARCHAR(80) NOT NULL,
 endpoint_id CHAR(48) NOT NULL,
 provider VARCHAR(40) NOT NULL,
 mode ENUM('test','live') NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,scope_key),
 UNIQUE KEY uq_payment_webhook_endpoint(endpoint_id),
 CONSTRAINT fk_webhook_setting FOREIGN KEY(tenant_id,scope_key) REFERENCES tenant_payment_settings(tenant_id,scope_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS tenant_payment_attempts (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 scope_key VARCHAR(80) NOT NULL,
 order_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NOT NULL,
 provider VARCHAR(40) NOT NULL,
 mode ENUM('test','live') NOT NULL,
 provider_payment_id VARCHAR(180) NOT NULL,
 amount_minor BIGINT UNSIGNED NOT NULL,
 currency CHAR(3) NOT NULL,
 status ENUM('pending','paid') NOT NULL DEFAULT 'pending',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_payment_attempt_provider(tenant_id,scope_key,provider,mode,provider_payment_id),
 CONSTRAINT fk_payment_attempt_setting FOREIGN KEY(tenant_id,scope_key) REFERENCES tenant_payment_settings(tenant_id,scope_key),
 CONSTRAINT fk_payment_attempt_order FOREIGN KEY(tenant_id,order_id) REFERENCES restaurant_orders(tenant_id,id),
 CONSTRAINT fk_payment_attempt_branch FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS tenant_payment_webhook_receipts (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 sequence_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 tenant_id VARCHAR(36) NOT NULL,
 scope_key VARCHAR(80) NOT NULL,
 endpoint_id CHAR(48) NOT NULL,
 provider VARCHAR(40) NOT NULL,
 mode ENUM('test','live') NOT NULL,
 event_key CHAR(64) NOT NULL,
 payment_id VARCHAR(180) NULL,
 event_type VARCHAR(100) NOT NULL,
 amount_minor BIGINT UNSIGNED NULL,
 currency CHAR(3) NULL,
 status VARCHAR(40) NOT NULL,
 received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_webhook_receipt(endpoint_id,event_key),
 UNIQUE KEY uq_webhook_sequence(sequence_id),
 KEY ix_webhook_last(endpoint_id,sequence_id),
 CONSTRAINT fk_webhook_receipt_setting FOREIGN KEY(tenant_id,scope_key) REFERENCES tenant_payment_settings(tenant_id,scope_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
