-- Additive registry: match legacy identity collations without altering parents.
SET @foon_edge_tenant_type = (SELECT CONCAT(COLUMN_TYPE,' CHARACTER SET ',CHARACTER_SET_NAME,' COLLATE ',COLLATION_NAME) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tenants' AND COLUMN_NAME='id' AND DATA_TYPE IN ('char','varchar') AND CHARACTER_MAXIMUM_LENGTH>=36);
SET @foon_edge_branch_type = (SELECT CONCAT(COLUMN_TYPE,' CHARACTER SET ',CHARACTER_SET_NAME,' COLLATE ',COLLATION_NAME) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='branches' AND COLUMN_NAME='id' AND DATA_TYPE IN ('char','varchar') AND CHARACTER_MAXIMUM_LENGTH>=36);
SET @foon_edge_actor_type = (SELECT CONCAT(COLUMN_TYPE,' CHARACTER SET ',CHARACTER_SET_NAME,' COLLATE ',COLLATION_NAME) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='id' AND DATA_TYPE IN ('char','varchar') AND CHARACTER_MAXIMUM_LENGTH>=36);
SET @foon_edge_device_sql = CONCAT('CREATE TABLE IF NOT EXISTS edge_devices (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id ',@foon_edge_tenant_type,' NOT NULL,
 branch_id ',@foon_edge_branch_type,' NOT NULL,
 actor_user_id ',@foon_edge_actor_type,' NOT NULL,
 name VARCHAR(180) NOT NULL,
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY edge_device_token (token_hash),
 KEY edge_device_tenant (tenant_id,branch_id),
 CONSTRAINT fk_edge_device_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_edge_device_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
 CONSTRAINT fk_edge_device_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
PREPARE foon_edge_device_stmt FROM @foon_edge_device_sql;
EXECUTE foon_edge_device_stmt;
DEALLOCATE PREPARE foon_edge_device_stmt;
