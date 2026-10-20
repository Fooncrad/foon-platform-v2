-- Servers with explicit_defaults_for_timestamp=OFF (MariaDB < 10.10, MySQL 5.7)
-- silently add ON UPDATE CURRENT_TIMESTAMP to the first TIMESTAMP column of a
-- table. Any later UPDATE then overwrote these expiry times with "now"
-- (for example, admin sessions expired on their first activity touch).
-- An explicit DEFAULT without ON UPDATE removes the automatic behavior.
-- Rows already overwritten stay expired (fail closed); no data is rewritten.
ALTER TABLE auth_sessions MODIFY expires_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE password_reset_tokens MODIFY expires_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE email_verification_tokens MODIFY expires_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE employee_invites MODIFY expires_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tenant_media_oauth_states MODIFY expires_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
