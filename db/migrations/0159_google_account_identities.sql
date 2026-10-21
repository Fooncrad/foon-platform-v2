CREATE TABLE IF NOT EXISTS auth_google_identities (
 google_sub VARCHAR(255) NOT NULL PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 email_at_link VARCHAR(254) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_google_identity_user (user_id),
 KEY idx_google_identity_email (email_at_link),
 CONSTRAINT fk_google_identity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
