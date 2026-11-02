-- FOON V2 0309: Branch-scoped section staffing and host notifications
CREATE TABLE IF NOT EXISTS restaurant_section_staff_assignments (
  tenant_id CHAR(36) NOT NULL,
  branch_id CHAR(36) NOT NULL,
  section_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  duty ENUM('waiter','host') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id,branch_id,section_id,user_id,duty),
  INDEX section_staff_by_user (tenant_id,branch_id,user_id,duty)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS restaurant_section_host_alerts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id CHAR(36) NOT NULL,
  branch_id CHAR(36) NOT NULL,
  section_id CHAR(36) NOT NULL,
  layout_id CHAR(36) NOT NULL,
  floor_table_id VARCHAR(60) NOT NULL,
  status ENUM('available','occupied','reserved','cleaning','out_of_service') NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX host_alert_feed (tenant_id,branch_id,section_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;