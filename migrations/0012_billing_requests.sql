CREATE TABLE IF NOT EXISTS platform_payment_requests (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 plan_id VARCHAR(36) NOT NULL,
 amount DECIMAL(12,2) NOT NULL,
 currency VARCHAR(3) NOT NULL DEFAULT 'SAR',
 billing_cycle ENUM('monthly','yearly') NOT NULL,
 transfer_reference VARCHAR(120) NOT NULL,
 status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
 review_note VARCHAR(500) NULL,
 reviewed_by VARCHAR(36) NULL,
 reviewed_at TIMESTAMP NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY ix_payment_status_created(status,created_at),
 CONSTRAINT fk_payment_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_payment_plan FOREIGN KEY(plan_id) REFERENCES package_plans(id),
 CONSTRAINT fk_payment_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
