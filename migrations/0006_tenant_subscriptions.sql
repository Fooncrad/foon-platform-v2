-- FOON-V2-REF-012: tenant subscription assignment. No automatic plan assignment.
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 plan_id VARCHAR(36) NOT NULL,
 status ENUM('active','pending','cancelled','expired') NOT NULL DEFAULT 'pending',
 starts_at DATETIME NULL,
 ends_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_tenant_subscription(tenant_id),
 KEY ix_subscription_plan(plan_id),
 CONSTRAINT fk_tenant_subscription_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_tenant_subscription_plan FOREIGN KEY(plan_id) REFERENCES package_plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
