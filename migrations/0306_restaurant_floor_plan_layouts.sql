-- Additional named layouts per existing dining section; legacy restaurant_floor_plans remains untouched.
CREATE TABLE IF NOT EXISTS restaurant_floor_plan_layouts (
 id CHAR(36) NOT NULL,
 tenant_id CHAR(36) NOT NULL,
 branch_id CHAR(36) NOT NULL,
 section_id CHAR(36) NOT NULL,
 name VARCHAR(120) NOT NULL,
 layout_json JSON NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(id),
 INDEX floor_layout_branch_section (tenant_id,branch_id,section_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
