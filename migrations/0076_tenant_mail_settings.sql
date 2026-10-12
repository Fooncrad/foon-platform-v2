-- Tenant mail transport overrides. Platform SMTP is inherited by default.
CREATE TABLE IF NOT EXISTS tenant_mail_settings (
 tenant_id VARCHAR(36) NOT NULL PRIMARY KEY,
 mode ENUM('platform','custom') NOT NULL DEFAULT 'platform',
 smtp_host VARCHAR(255) NULL,
 smtp_port SMALLINT UNSIGNED NULL,
 smtp_user VARCHAR(255) NULL,
 smtp_from VARCHAR(255) NULL,
 smtp_from_name VARCHAR(160) NULL,
 smtp_secret TEXT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_tenant_mail_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
