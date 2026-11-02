-- Media Studio social connections are tenant-scoped.
-- OAuth tokens must be encrypted by application code before persistence.
-- Never store social passwords or raw OAuth tokens in audit logs.
CREATE TABLE IF NOT EXISTS tenant_media_social_accounts (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 provider ENUM('instagram','facebook','tiktok','snapchat','youtube','x','whatsapp') NOT NULL,
 provider_account_id VARCHAR(190) COLLATE utf8mb4_bin NOT NULL,
 display_name VARCHAR(190) NOT NULL DEFAULT '',
 account_type VARCHAR(40) NOT NULL DEFAULT '',
 status ENUM('connected','reauthorization_required','revoked','disabled') NOT NULL DEFAULT 'reauthorization_required',
 granted_scopes TEXT NULL,
 access_token_ciphertext MEDIUMTEXT NULL,
 refresh_token_ciphertext MEDIUMTEXT NULL,
 token_expires_at TIMESTAMP NULL,
 last_verified_at TIMESTAMP NULL,
 created_by VARCHAR(36) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_media_tenant_provider_account (tenant_id,provider,provider_account_id),
 KEY ix_media_accounts_tenant_status (tenant_id,status),
 CONSTRAINT fk_media_account_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 CONSTRAINT fk_media_account_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- State must be random, one-time and expire; only its hash is stored.
CREATE TABLE IF NOT EXISTS tenant_media_oauth_states (
 state_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 provider ENUM('instagram','facebook','tiktok','snapchat','youtube','x','whatsapp') NOT NULL,
 redirect_path VARCHAR(255) NOT NULL DEFAULT '/restaurant/media-studio',
 expires_at TIMESTAMP NOT NULL,
 consumed_at TIMESTAMP NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_media_oauth_expiry (expires_at),
 KEY ix_media_oauth_tenant (tenant_id,user_id),
 CONSTRAINT fk_media_oauth_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 CONSTRAINT fk_media_oauth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
