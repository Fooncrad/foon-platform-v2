-- Administrative payment receipts, not tax invoices.
CREATE TABLE IF NOT EXISTS platform_payment_receipts (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 payment_request_id VARCHAR(36) NOT NULL,
 tenant_id VARCHAR(36) NOT NULL,
 receipt_number VARCHAR(60) NOT NULL,
 amount DECIMAL(12,2) NOT NULL,
 currency CHAR(3) NOT NULL,
 issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_receipt_payment_request(payment_request_id),
 UNIQUE KEY uq_receipt_number(receipt_number),
 KEY ix_receipt_tenant(tenant_id,issued_at),
 CONSTRAINT fk_receipt_request FOREIGN KEY(payment_request_id) REFERENCES platform_payment_requests(id),
 CONSTRAINT fk_receipt_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
