-- 0107: creator identity belongs to a customer user, never a restaurant/tenant.
-- Every newly created profile defaults to PRIVATE. Existing accounts remain untouched.
CREATE TABLE IF NOT EXISTS customer_creator_profiles (
 user_id VARCHAR(36) NOT NULL PRIMARY KEY,
 handle VARCHAR(40) NOT NULL,
 display_name VARCHAR(180) NOT NULL,
 bio VARCHAR(1500) NOT NULL DEFAULT '',
 visibility ENUM('private','public') NOT NULL DEFAULT 'private',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_customer_creator_handle(handle),
 CONSTRAINT fk_customer_creator_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Creator publishes only explicitly selected images already owned in their
-- personal library. No implicit exposure of a private library, order or profile.
CREATE TABLE IF NOT EXISTS customer_creator_portfolio (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL,
 media_id VARCHAR(36) NOT NULL,
 caption VARCHAR(240) NOT NULL DEFAULT '',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_customer_creator_portfolio_media(user_id,media_id),
 KEY ix_customer_creator_portfolio_created(user_id,created_at),
 CONSTRAINT fk_creator_portfolio_profile FOREIGN KEY(user_id) REFERENCES customer_creator_profiles(user_id) ON DELETE CASCADE,
 CONSTRAINT fk_creator_portfolio_media FOREIGN KEY(media_id) REFERENCES user_media_library(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
