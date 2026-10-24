-- Personal store favorites belong to the signed-in customer, never the merchant.
-- Favorites can only reference stores already linked to this customer.
CREATE TABLE IF NOT EXISTS customer_favorite_stores (
 user_id VARCHAR(36) NOT NULL,
 tenant_id VARCHAR(36) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (user_id,tenant_id),
 KEY ix_customer_favorite_store (tenant_id,user_id),
 CONSTRAINT fk_customer_favorite_membership FOREIGN KEY (tenant_id,user_id)
  REFERENCES tenant_customers(tenant_id,user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
