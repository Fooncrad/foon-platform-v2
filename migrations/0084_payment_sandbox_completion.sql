-- A completed sandbox transaction must not leave gateway settings locked forever.
-- This status never changes the corresponding business order's payment status.
ALTER TABLE tenant_payment_attempts
 MODIFY status ENUM('pending','paid','test_completed') NOT NULL DEFAULT 'pending';
