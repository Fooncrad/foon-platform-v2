-- Immutable first-store attribution for a unified FOON customer identity.
-- Existing customer relationships remain many-to-many in tenant_customers.
CREATE TABLE IF NOT EXISTS customer_origins (
 user_id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_customer_origins_tenant (tenant_id),
 CONSTRAINT fk_customer_origins_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_customer_origins_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill historical customers using the earliest recorded store relationship.
-- A deterministic tenant_id tie-break avoids ambiguous same-second timestamps.
INSERT INTO customer_origins (user_id,tenant_id,created_at)
SELECT c.user_id,c.tenant_id,c.created_at
FROM tenant_customers c
WHERE NOT EXISTS (SELECT 1 FROM customer_origins o WHERE o.user_id=c.user_id)
 AND NOT EXISTS (
  SELECT 1 FROM tenant_customers earlier
  WHERE earlier.user_id=c.user_id
    AND (earlier.created_at<c.created_at OR (earlier.created_at=c.created_at AND earlier.tenant_id<c.tenant_id))
 )
ON DUPLICATE KEY UPDATE user_id=VALUES(user_id);
