-- Time-limited platform support access is tied to the admin's authenticated session.
CREATE TABLE IF NOT EXISTS platform_tenant_support_sessions (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 auth_session_id VARCHAR(64) NOT NULL,
 actor_user_id VARCHAR(36) NOT NULL,
 tenant_id VARCHAR(36) NOT NULL,
 platform_role ENUM('super_admin','admin','support') NOT NULL,
 expires_at DATETIME NOT NULL,
 ended_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_support_session_current (auth_session_id,tenant_id,expires_at,ended_at),
 KEY ix_support_tenant_time (tenant_id,created_at),
 CONSTRAINT fk_support_session_auth FOREIGN KEY (auth_session_id) REFERENCES auth_sessions(id) ON DELETE CASCADE,
 CONSTRAINT fk_support_session_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_support_session_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
