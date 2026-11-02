-- 0154 — database-enforced anti-double-claim for platform bank transfer references.
-- This uniquely claims one currency/reference even during concurrent approvals.
-- Existing approved payments are backfilled conservatively; duplicate historic
-- references must be reviewed manually using the read-only audit query in docs.
CREATE TABLE IF NOT EXISTS platform_approved_transfer_claims (
 currency CHAR(3) NOT NULL,
 transfer_reference VARCHAR(120) NOT NULL,
 payment_request_id VARCHAR(36) NOT NULL,
 claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(currency,transfer_reference),
 UNIQUE KEY uq_platform_transfer_claim_payment(payment_request_id),
 CONSTRAINT fk_platform_transfer_claim_request FOREIGN KEY(payment_request_id) REFERENCES platform_payment_requests(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO platform_approved_transfer_claims(currency,transfer_reference,payment_request_id)
SELECT p.currency,p.transfer_reference,p.id FROM platform_payment_requests p
WHERE p.status='approved'
ORDER BY p.reviewed_at,p.id;
