-- Durable notification delivery queue; email delivery requires a separately configured worker.
CREATE TABLE IF NOT EXISTS platform_notification_outbox (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 event_key VARCHAR(80) NOT NULL,
 tenant_id VARCHAR(36) NULL,
 recipient_email VARCHAR(254) NOT NULL,
 subject VARCHAR(250) NOT NULL,
 body_text TEXT NOT NULL,
 status ENUM('pending','processing','sent','failed') NOT NULL DEFAULT 'pending',
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 last_error VARCHAR(500) NULL,
 next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 sent_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY ix_outbox_delivery(status,next_attempt_at),
 KEY ix_outbox_tenant(tenant_id),
 CONSTRAINT fk_outbox_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
