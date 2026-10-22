-- Desktop-only state. Cloud installations leave these tables empty.
CREATE TABLE IF NOT EXISTS desktop_sync_devices (
 device_id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NOT NULL,
 actor_user_id VARCHAR(36) NOT NULL,
 state ENUM('active','blocked') NOT NULL DEFAULT 'active',
 lease_until DATETIME(3) NULL,
 can_create BOOLEAN NOT NULL DEFAULT FALSE,
 can_update BOOLEAN NOT NULL DEFAULT FALSE,
 last_error VARCHAR(80) NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_desktop_device_scope(device_id,tenant_id,branch_id),
 CONSTRAINT fk_desktop_device_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_desktop_device_branch FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id),
 CONSTRAINT fk_desktop_device_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS desktop_sync_outbox (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 device_id VARCHAR(36) NOT NULL,
 tenant_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NOT NULL,
 order_id VARCHAR(36) NOT NULL,
 kind ENUM('created','status') NOT NULL,
 order_version INT UNSIGNED NOT NULL,
 payload LONGTEXT NOT NULL,
 digest CHAR(64) NOT NULL,
 state ENUM('pending','retrying','conflict','synced') NOT NULL DEFAULT 'pending',
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 next_attempt_at DATETIME(3) NULL,
 last_error VARCHAR(80) NULL,
 receipt LONGTEXT NULL,
 synced_at DATETIME(3) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_desktop_order_event(device_id,order_id,kind,order_version),
 KEY ix_desktop_pending(device_id,state,id),
 CONSTRAINT fk_desktop_outbox_device FOREIGN KEY(device_id,tenant_id,branch_id) REFERENCES desktop_sync_devices(device_id,tenant_id,branch_id),
 CONSTRAINT fk_desktop_outbox_order FOREIGN KEY(tenant_id,order_id) REFERENCES restaurant_orders(tenant_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
