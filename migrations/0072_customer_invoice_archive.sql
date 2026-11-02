-- Immutable customer invoice snapshots. Issue only after payment confirmation.
-- invoice_json holds item lines, tax breakdown, seller details and order fulfillment context.
CREATE TABLE IF NOT EXISTS restaurant_customer_invoices (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NOT NULL,
 order_id VARCHAR(36) NOT NULL,
 customer_user_id VARCHAR(36) NULL,
 invoice_number VARCHAR(64) NOT NULL,
 invoice_kind ENUM('receipt','tax_invoice','credit_note') NOT NULL DEFAULT 'receipt',
 invoice_json JSON NOT NULL,
 currency VARCHAR(3) NOT NULL DEFAULT 'SAR',
 total DECIMAL(12,2) NOT NULL,
 issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 email_status ENUM('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
 email_attempts INT UNSIGNED NOT NULL DEFAULT 0,
 emailed_at DATETIME(3) NULL,
 email_last_error VARCHAR(500) NULL,
 UNIQUE KEY uq_customer_invoice_order_kind (tenant_id,order_id,invoice_kind),
 UNIQUE KEY uq_customer_invoice_number (tenant_id,invoice_number),
 KEY idx_customer_invoice_account (customer_user_id,issued_at),
 KEY idx_customer_invoice_email (email_status,issued_at),
 CONSTRAINT fk_customer_invoice_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_customer_invoice_order FOREIGN KEY (order_id) REFERENCES restaurant_orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
