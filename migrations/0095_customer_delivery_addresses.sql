-- Account-scoped delivery addresses; no tenant-owned data is mixed into the customer address book.
-- Keep the user's stored addresses when they stop shopping at any particular merchant.
CREATE TABLE IF NOT EXISTS customer_delivery_addresses (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
 user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
 label VARCHAR(80) NOT NULL,
 recipient_name VARCHAR(180) NULL,
 phone VARCHAR(40) NULL,
 country_code CHAR(2) NOT NULL DEFAULT 'SA',
 city VARCHAR(120) NOT NULL,
 district VARCHAR(180) NULL,
 street_address VARCHAR(500) NOT NULL,
 building VARCHAR(100) NULL,
 apartment VARCHAR(100) NULL,
 delivery_notes VARCHAR(1000) NULL,
 latitude DECIMAL(10,7) NULL,
 longitude DECIMAL(10,7) NULL,
 is_default BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (id),
 KEY idx_delivery_address_owner (user_id,is_default,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
