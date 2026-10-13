CREATE TABLE IF NOT EXISTS activity_storefront_templates (
 tenant_id VARCHAR(36) NOT NULL PRIMARY KEY,
 template_key VARCHAR(80) NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_activity_storefront_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);
