ALTER TABLE display_slides
 ADD COLUMN campaign_id CHAR(36) NULL AFTER tenant_id,
 ADD INDEX display_slides_campaign_id_idx (tenant_id, campaign_id, enabled);
