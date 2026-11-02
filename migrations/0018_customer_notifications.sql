-- Persistent in-account notifications, independent of external delivery providers.
CREATE TABLE IF NOT EXISTS customer_notifications (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL,
 tenant_id VARCHAR(36) NOT NULL,
 event_key VARCHAR(80) NOT NULL,
 subject VARCHAR(250) NOT NULL,
 body_text TEXT NOT NULL,
 resource_id VARCHAR(36) NULL,
 read_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_customer_notifications_user (user_id,created_at),
 KEY ix_customer_notifications_unread (user_id,read_at),
 CONSTRAINT fk_customer_notifications_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_customer_notifications_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
