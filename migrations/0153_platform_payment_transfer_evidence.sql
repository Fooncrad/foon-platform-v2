-- 0153: evidence is private and never becomes a public URL or proof of settled funds.
-- Platform admins must verify actual bank funds before approving payment requests.
CREATE TABLE IF NOT EXISTS platform_payment_transfer_evidence (
 payment_request_id VARCHAR(36) NOT NULL PRIMARY KEY,
 mime_type ENUM('image/jpeg','image/png','application/pdf') NOT NULL,
 file_size INT UNSIGNED NOT NULL,
 contents MEDIUMBLOB NOT NULL,
 uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_platform_transfer_evidence_request FOREIGN KEY(payment_request_id) REFERENCES platform_payment_requests(id) ON DELETE CASCADE,
 CONSTRAINT chk_payment_transfer_file_size CHECK(file_size<=2097152 AND file_size>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
