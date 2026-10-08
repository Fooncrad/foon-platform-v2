CREATE TABLE IF NOT EXISTS tenant_customers (
 tenant_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,user_id),
 KEY ix_tenant_customers_user(user_id),
 CONSTRAINT fk_tenant_customer_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_tenant_customer_user FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
