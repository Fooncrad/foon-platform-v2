-- Deploy only after reviewing a verified backup. Does not change any existing PIN.
-- Additional branches without a PIN remain locked until the owner configures one.
ALTER TABLE branches ADD COLUMN pin_salt VARCHAR(32) NULL, ADD COLUMN pin_hash CHAR(64) NULL;
CREATE TABLE IF NOT EXISTS branch_pin_access (
 auth_session_id CHAR(36) NOT NULL,
 tenant_id CHAR(36) NOT NULL,
 branch_id CHAR(36) NOT NULL,
 attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 blocked_until DATETIME NULL,
 unlocked_until DATETIME NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(auth_session_id,branch_id),
 KEY idx_branch_pin_tenant (tenant_id,branch_id)
);
