-- Activation per saved plan, manual operations distinct from real reservation payment state.
ALTER TABLE restaurant_floor_plan_layouts
 ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS restaurant_floor_table_operations (
 tenant_id CHAR(36) NOT NULL,
 branch_id CHAR(36) NOT NULL,
 layout_id CHAR(36) NOT NULL,
 floor_table_id VARCHAR(60) NOT NULL,
 status ENUM('available','occupied','reserved','cleaning','out_of_service') NOT NULL DEFAULT 'available',
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (tenant_id,branch_id,layout_id,floor_table_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
