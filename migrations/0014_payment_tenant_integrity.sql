-- Strict DB-level tenant/branch integrity: branch must belong to the same tenant.
-- Run after 0013. Existing mismatched records must be corrected before applying.
ALTER TABLE branches ADD UNIQUE KEY uq_branches_tenant_id (tenant_id,id);
ALTER TABLE tenant_payment_settings
 ADD CONSTRAINT fk_payment_branch_same_tenant
 FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT;
