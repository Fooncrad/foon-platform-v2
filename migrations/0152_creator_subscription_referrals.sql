-- FOON 0152 — Customer creators earn commission only after confirmed PLATFORM paid subscription.
-- Independent from merchant checkout/payment gateway processing and creator's personal privacy.
CREATE TABLE IF NOT EXISTS platform_creator_referral_settings (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 commission_basis_points SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 updated_by VARCHAR(36) NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_creator_rate_actor FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL,
 CONSTRAINT chk_creator_rate CHECK(commission_basis_points<=10000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO platform_creator_referral_settings(id,enabled,commission_basis_points) VALUES (1,FALSE,0);

-- Attribution is immutable for each newly registered business; does not grant creator any tenant permissions.
CREATE TABLE IF NOT EXISTS customer_creator_referrals (
 tenant_id VARCHAR(36) NOT NULL PRIMARY KEY,
 creator_user_id VARCHAR(36) NOT NULL,
 referral_handle VARCHAR(40) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_creator_referrer(creator_user_id,created_at),
 CONSTRAINT fk_creator_referral_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
 CONSTRAINT fk_creator_referral_creator FOREIGN KEY(creator_user_id) REFERENCES customer_creator_profiles(user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each approved payment request yields at most one fixed-snapshot commission.
-- 'earned' is NOT a payout; only a confirmed admin transfer can mark 'paid'.
CREATE TABLE IF NOT EXISTS customer_creator_commissions (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 payment_request_id VARCHAR(36) NOT NULL,
 tenant_id VARCHAR(36) NOT NULL,
 creator_user_id VARCHAR(36) NOT NULL,
 plan_id VARCHAR(36) NOT NULL,
 billing_cycle ENUM('monthly','yearly') NOT NULL,
 currency CHAR(3) NOT NULL,
 base_amount DECIMAL(12,2) NOT NULL,
 commission_basis_points SMALLINT UNSIGNED NOT NULL,
 amount DECIMAL(12,2) NOT NULL,
 status ENUM('earned','paid','reversed') NOT NULL DEFAULT 'earned',
 payout_reference VARCHAR(160) NULL,
 paid_at TIMESTAMP NULL,
 reviewed_by VARCHAR(36) NULL,
 reviewed_at TIMESTAMP NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_creator_commission_payment(payment_request_id),
 KEY ix_creator_commission_user(creator_user_id,status,created_at),
 KEY ix_creator_commission_status(status,created_at),
 CONSTRAINT fk_creator_commission_request FOREIGN KEY(payment_request_id) REFERENCES platform_payment_requests(id) ON DELETE RESTRICT,
 CONSTRAINT fk_creator_commission_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
 CONSTRAINT fk_creator_commission_creator FOREIGN KEY(creator_user_id) REFERENCES customer_creator_profiles(user_id) ON DELETE RESTRICT,
 CONSTRAINT fk_creator_commission_plan FOREIGN KEY(plan_id) REFERENCES package_plans(id),
 CONSTRAINT fk_creator_commission_actor FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
 CONSTRAINT chk_creator_commission_rate CHECK(commission_basis_points<=10000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
