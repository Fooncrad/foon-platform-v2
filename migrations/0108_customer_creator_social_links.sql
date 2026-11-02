-- 0108: independent social links owned by the customer creator profile.
-- Additive migration: safe when 0107 was previously applied.
-- Does not grant any merchant plan feature or expose personal contact details.
CREATE TABLE IF NOT EXISTS customer_creator_social_links (
 user_id VARCHAR(36) NOT NULL,
 platform VARCHAR(24) NOT NULL,
 url VARCHAR(512) NOT NULL,
 display_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,platform),
 CONSTRAINT fk_creator_social_profile FOREIGN KEY(user_id) REFERENCES customer_creator_profiles(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
