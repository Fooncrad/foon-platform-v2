-- Record explicit acceptance at account creation or creation of an additional business.
-- NULL preserves historical accounts without implying that they accepted.
ALTER TABLE users
 ADD COLUMN legal_accepted_at TIMESTAMP NULL DEFAULT NULL;
