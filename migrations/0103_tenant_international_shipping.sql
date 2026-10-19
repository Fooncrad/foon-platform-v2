-- Shipping to foreign destinations is opt-in and requires platform approval.
CREATE TABLE IF NOT EXISTS tenant_international_shipping (
 tenant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL PRIMARY KEY,
 status ENUM('pending','approved','rejected','disabled') NOT NULL DEFAULT 'pending',
 requested_countries JSON NOT NULL,
 approved_countries JSON NULL,
 reviewed_by CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
 reviewed_at TIMESTAMP NULL,
 requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
