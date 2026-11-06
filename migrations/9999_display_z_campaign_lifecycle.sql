-- Follow-up lifecycle schema. Keep the previously released 9999_display_unified_campaigns.sql immutable.
CREATE TABLE IF NOT EXISTS display_campaigns (
 id CHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 status ENUM('scheduled','active','paused','completed') NOT NULL DEFAULT 'active',
 destinations JSON NOT NULL,
 branch_ids JSON NULL,
 creative JSON NOT NULL,
 starts_at DATETIME NULL,
 ends_at DATETIME NULL,
 previous_cover_url VARCHAR(500) NULL,
 applied_cover_url VARCHAR(500) NULL,
 created_by VARCHAR(36) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY display_campaigns_tenant_status_idx (tenant_id,status,starts_at,ends_at),
 CONSTRAINT display_campaigns_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE display_slides
 ADD INDEX display_slides_campaign_fk_idx (campaign_id),
 ADD CONSTRAINT display_slides_campaign_fk FOREIGN KEY (campaign_id) REFERENCES display_campaigns(id) ON DELETE CASCADE;
