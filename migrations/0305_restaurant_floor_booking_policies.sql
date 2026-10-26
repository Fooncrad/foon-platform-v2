-- Floor plan booking policies are disabled until payment settlement and real table mapping are configured.
CREATE TABLE IF NOT EXISTS restaurant_floor_booking_policies (
 tenant_id CHAR(36) NOT NULL,
 branch_id CHAR(36) NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 booking_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
 session_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 90,
 order_policy ENUM('optional','required','disabled') NOT NULL DEFAULT 'optional',
 refund_policy ENUM('restaurant','nonrefundable') NOT NULL DEFAULT 'restaurant',
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (tenant_id,branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
