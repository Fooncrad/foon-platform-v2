-- Additive foundation for customer delivery profiles, order sessions, loyalty and notifications.
CREATE TABLE IF NOT EXISTS customer_delivery_addresses (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL,
 label VARCHAR(80) NOT NULL DEFAULT 'المنزل',
 recipient_name VARCHAR(180) NULL,
 phone VARCHAR(40) NULL,
 country_code CHAR(2) NOT NULL DEFAULT 'SA',
 city VARCHAR(120) NOT NULL,
 district VARCHAR(180) NULL,
 street_address VARCHAR(500) NOT NULL,
 building VARCHAR(100) NULL,
 apartment VARCHAR(100) NULL,
 delivery_notes TEXT NULL,
 latitude DECIMAL(10,7) NULL,
 longitude DECIMAL(10,7) NULL,
 is_default BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY ix_customer_delivery_addresses_user(user_id,is_default),
 CONSTRAINT fk_customer_delivery_addresses_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS customer_service_sessions (
 id VARCHAR(36) PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NULL,
 table_id VARCHAR(36) NULL,
 channel VARCHAR(32) NOT NULL,
 status ENUM('open','closed') NOT NULL DEFAULT 'open',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 closed_at TIMESTAMP NULL,
 KEY ix_customer_service_sessions_user(tenant_id,user_id,status),
 CONSTRAINT fk_customer_service_sessions_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 CONSTRAINT fk_customer_service_sessions_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_customer_service_sessions_branch FOREIGN KEY(branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS customer_service_session_orders (
 session_id VARCHAR(36) NOT NULL,
 order_id VARCHAR(36) NOT NULL,
 tenant_id VARCHAR(36) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(session_id,order_id),
 UNIQUE KEY uq_session_order(order_id),
 CONSTRAINT fk_customer_session_order_session FOREIGN KEY(session_id) REFERENCES customer_service_sessions(id) ON DELETE CASCADE,
 CONSTRAINT fk_customer_session_order_order FOREIGN KEY(order_id) REFERENCES restaurant_orders(id) ON DELETE CASCADE,
 CONSTRAINT fk_customer_session_order_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS tenant_loyalty_programs (
 tenant_id VARCHAR(36) PRIMARY KEY,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 points_per_currency DECIMAL(10,4) NOT NULL DEFAULT 1,
 redemption_value DECIMAL(10,4) NOT NULL DEFAULT 0,
 min_redeem_points INT UNSIGNED NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_tenant_loyalty_programs_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS customer_loyalty_ledger (
 id VARCHAR(36) PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 order_id VARCHAR(36) NULL,
 points_delta INT NOT NULL,
 reason VARCHAR(80) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_customer_loyalty_balance(tenant_id,user_id,created_at),
 CONSTRAINT fk_customer_loyalty_ledger_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 CONSTRAINT fk_customer_loyalty_ledger_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_customer_loyalty_ledger_order FOREIGN KEY(order_id) REFERENCES restaurant_orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS customer_account_notifications (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL,
 tenant_id VARCHAR(36) NULL,
 event_key VARCHAR(80) NOT NULL,
 title VARCHAR(240) NOT NULL,
 body TEXT NOT NULL,
 related_order_id VARCHAR(36) NULL,
 read_at TIMESTAMP NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_customer_account_notifications(user_id,read_at,created_at),
 CONSTRAINT fk_customer_account_notifications_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_customer_account_notifications_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
 CONSTRAINT fk_customer_account_notifications_order FOREIGN KEY(related_order_id) REFERENCES restaurant_orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
