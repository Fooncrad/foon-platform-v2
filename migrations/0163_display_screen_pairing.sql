CREATE TABLE IF NOT EXISTS display_pairing_sessions (
 id CHAR(36) NOT NULL,
 code_hash CHAR(64) NOT NULL,
 token_hash CHAR(64) NOT NULL,
 expires_at DATETIME NOT NULL,
 claimed_screen_id CHAR(36) NULL,
 claimed_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (id),
 UNIQUE KEY display_pairing_code_hash_uq (code_hash),
 UNIQUE KEY display_pairing_token_hash_uq (token_hash),
 KEY display_pairing_expires_idx (expires_at),
 KEY display_pairing_claimed_screen_idx (claimed_screen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
