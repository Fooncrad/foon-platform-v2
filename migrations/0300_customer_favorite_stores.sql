-- Customer-specific favorite stores; never grants tenant access or marketing consent.
CREATE TABLE IF NOT EXISTS customer_favorite_stores (
 user_id VARCHAR(36) NOT NULL,
 tenant_id VARCHAR(36) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,tenant_id),
 KEY ix_customer_favorites_tenant(tenant_id),
 CONSTRAINT fk_customer_fav_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_customer_fav_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
