-- FOON-V2-REF-002: independent subscription feature catalog (ideas only).
CREATE TABLE IF NOT EXISTS package_plans (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 code VARCHAR(80) NOT NULL UNIQUE,
 name_ar VARCHAR(180) NOT NULL,
 name_en VARCHAR(180) NOT NULL,
 name_fr VARCHAR(180) NOT NULL,
 description_ar TEXT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 sort_order INT NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS package_plan_prices (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 plan_id VARCHAR(36) NOT NULL,
 billing_cycle ENUM('monthly','yearly') NOT NULL,
 currency CHAR(3) NOT NULL DEFAULT 'SAR',
 price DECIMAL(12,2) NOT NULL DEFAULT 0,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_plan_cycle_currency(plan_id,billing_cycle,currency),
 CONSTRAINT fk_plan_price_plan FOREIGN KEY(plan_id) REFERENCES package_plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS package_features (
 feature_key VARCHAR(100) NOT NULL PRIMARY KEY,
 name_ar VARCHAR(180) NOT NULL,
 name_en VARCHAR(180) NOT NULL,
 category VARCHAR(80) NOT NULL,
 value_type ENUM('boolean','limit') NOT NULL DEFAULT 'boolean',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS package_plan_features (
 plan_id VARCHAR(36) NOT NULL,
 feature_key VARCHAR(100) NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 limit_value INT NULL,
 PRIMARY KEY(plan_id,feature_key),
 CONSTRAINT fk_plan_feature_plan FOREIGN KEY(plan_id) REFERENCES package_plans(id),
 CONSTRAINT fk_plan_feature_definition FOREIGN KEY(feature_key) REFERENCES package_features(feature_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
