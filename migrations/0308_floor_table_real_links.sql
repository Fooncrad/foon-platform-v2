-- Link a drawn floor-plan table to an actual registered dining_table, without changing legacy reservations.
CREATE TABLE IF NOT EXISTS restaurant_floor_table_links (
 tenant_id CHAR(36) NOT NULL,
 branch_id CHAR(36) NOT NULL,
 layout_id CHAR(36) NOT NULL,
 floor_table_id VARCHAR(60) NOT NULL,
 dining_table_id CHAR(36) NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (tenant_id,branch_id,layout_id,floor_table_id),
 UNIQUE KEY uq_floor_real_table (tenant_id,branch_id,dining_table_id),
 INDEX floor_table_lookup (tenant_id,branch_id,layout_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
