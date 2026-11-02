-- Provider transaction IDs are case-sensitive. Binary comparisons prevent one ID from matching a different payment that varies only by letter case.
ALTER TABLE tenant_payment_attempts MODIFY provider_payment_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE tenant_payment_webhook_receipts MODIFY payment_id VARCHAR(180) COLLATE utf8mb4_bin NULL;
