-- NFOOD Growth Engine: dormant campaign and reward schema.
-- Creating tables does not grant coupons, award points or modify existing orders.
CREATE TABLE IF NOT EXISTS growth_campaigns (
 id VARCHAR(36) PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NULL,
 kind ENUM('first_order','second_order','coupon','flash_sale','reorder') NOT NULL,
 title_ar VARCHAR(180) NOT NULL,
 title_en VARCHAR(180) NULL,
 title_fr VARCHAR(180) NULL,
 discount_type ENUM('fixed','percent') NOT NULL,
 discount_value DECIMAL(12,2) NOT NULL,
 currency CHAR(3) NOT NULL DEFAULT 'SAR',
 minimum_spend DECIMAL(12,2) NOT NULL DEFAULT 0,
 maximum_discount DECIMAL(12,2) NULL,
 usage_limit INT UNSIGNED NULL,
 per_customer_limit INT UNSIGNED NOT NULL DEFAULT 1,
 starts_at DATETIME NOT NULL,
 ends_at DATETIME NOT NULL,
 status ENUM('draft','active','paused','expired') NOT NULL DEFAULT 'draft',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY ix_growth_campaign_tenant(tenant_id,status,starts_at,ends_at),
 CONSTRAINT fk_growth_campaign_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 CONSTRAINT chk_growth_campaign_discount CHECK(discount_value>0 AND (discount_type<>'percent' OR discount_value<=100)),
 CONSTRAINT chk_growth_campaign_dates CHECK(ends_at>starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS growth_coupon_codes (
 id VARCHAR(36) PRIMARY KEY,
 campaign_id VARCHAR(36) NOT NULL,
 code VARCHAR(60) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_growth_coupon_campaign_code(campaign_id,code),
 CONSTRAINT fk_growth_coupon_campaign FOREIGN KEY(campaign_id) REFERENCES growth_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Claim ledger provides the unique order/campaign key needed for idempotent checkout integration.
CREATE TABLE IF NOT EXISTS growth_campaign_redemptions (
 id VARCHAR(36) PRIMARY KEY,
 campaign_id VARCHAR(36) NOT NULL,
 tenant_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 order_id VARCHAR(36) NOT NULL,
 discount_amount DECIMAL(12,2) NOT NULL,
 status ENUM('reserved','confirmed','reversed') NOT NULL DEFAULT 'reserved',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_growth_redemption_campaign_order(campaign_id,order_id),
 KEY ix_growth_redemption_customer(campaign_id,user_id,status),
 KEY ix_growth_redemption_tenant(tenant_id,status),
 CONSTRAINT fk_growth_redemption_campaign FOREIGN KEY(campaign_id) REFERENCES growth_campaigns(id) ON DELETE RESTRICT,
 CONSTRAINT fk_growth_redemption_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
 CONSTRAINT fk_growth_redemption_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT chk_growth_redemption_amount CHECK(discount_amount>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-business loyalty ledger. No global cross-currency value is implied.
CREATE TABLE IF NOT EXISTS growth_reward_ledger (
 id VARCHAR(36) PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 source_order_id VARCHAR(36) NULL,
 source_reference VARCHAR(100) NOT NULL,
 movement ENUM('earn','spend','reverse','expire') NOT NULL,
 points INT UNSIGNED NOT NULL,
 expires_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_growth_reward_source(tenant_id,user_id,source_reference,movement),
 KEY ix_growth_reward_customer(tenant_id,user_id,created_at),
 CONSTRAINT fk_growth_reward_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
 CONSTRAINT fk_growth_reward_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT chk_growth_reward_positive CHECK(points>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
