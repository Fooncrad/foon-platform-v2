-- Normalize PIN access UUID collations for MariaDB 11.8 and MySQL 8.4.
-- auth_sessions.id is utf8mb4_unicode_ci; mismatched defaults can make the
-- session-bound PIN JOIN fail with ER_CANT_AGGREGATE_2COLLATIONS.
-- This is additive to migration 0150 for databases that previously applied it.
ALTER TABLE branch_pin_access CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
