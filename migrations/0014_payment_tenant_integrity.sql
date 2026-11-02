-- Strict DB-level tenant/branch integrity. Existing mismatches must be resolved first.
-- Replays after manual application or partial DDL are allowed only for matching definitions.
SET @foon_integrity_sql = IF(
 EXISTS(
  SELECT 1 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='branches'
   AND INDEX_NAME='uq_branches_tenant_id'
  GROUP BY INDEX_NAME
  HAVING COUNT(*)=2 AND MAX(NON_UNIQUE)=0
   AND GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)='tenant_id,id'
   AND COUNT(SUB_PART)=0
 ),
 'SELECT 1',
 'ALTER TABLE branches ADD UNIQUE KEY uq_branches_tenant_id (tenant_id,id)'
);
PREPARE foon_integrity_stmt FROM @foon_integrity_sql;
EXECUTE foon_integrity_stmt;
DEALLOCATE PREPARE foon_integrity_stmt;

SET @foon_integrity_sql = IF(
 EXISTS(
  SELECT 1 FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
   ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA
   AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
  WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.TABLE_NAME='tenant_payment_settings'
   AND k.CONSTRAINT_NAME='fk_payment_branch_same_tenant'
   AND k.REFERENCED_TABLE_SCHEMA=DATABASE()
   AND k.REFERENCED_TABLE_NAME='branches'
   AND r.DELETE_RULE IN ('RESTRICT','NO ACTION')
   AND r.UPDATE_RULE IN ('RESTRICT','NO ACTION')
  GROUP BY k.CONSTRAINT_NAME
  HAVING COUNT(*)=2
   AND GROUP_CONCAT(k.COLUMN_NAME ORDER BY k.ORDINAL_POSITION)='tenant_id,branch_id'
   AND GROUP_CONCAT(k.REFERENCED_COLUMN_NAME ORDER BY k.ORDINAL_POSITION)='tenant_id,id'
 ),
 'SELECT 1',
 'ALTER TABLE tenant_payment_settings ADD CONSTRAINT fk_payment_branch_same_tenant FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT'
);
PREPARE foon_integrity_stmt FROM @foon_integrity_sql;
EXECUTE foon_integrity_stmt;
DEALLOCATE PREPARE foon_integrity_stmt;
