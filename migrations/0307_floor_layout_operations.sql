-- Activation per saved plan, manual operations distinct from real reservation payment state.
SET @foon_floor_add_is_active_sql = IF(
 EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = DATABASE()
   AND table_name = 'restaurant_floor_plan_layouts'
   AND column_name = 'is_active'
 ),
 'SELECT 1',
 'ALTER TABLE restaurant_floor_plan_layouts ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT FALSE'
);
PREPARE foon_floor_add_is_active_stmt FROM @foon_floor_add_is_active_sql;
EXECUTE foon_floor_add_is_active_stmt;
DEALLOCATE PREPARE foon_floor_add_is_active_stmt;
CREATE TABLE IF NOT EXISTS restaurant_floor_table_operations (
 tenant_id CHAR(36) NOT NULL,
 branch_id CHAR(36) NOT NULL,
 layout_id CHAR(36) NOT NULL,
 floor_table_id VARCHAR(60) NOT NULL,
 status ENUM('available','occupied','reserved','cleaning','out_of_service') NOT NULL DEFAULT 'available',
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (tenant_id,branch_id,layout_id,floor_table_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
