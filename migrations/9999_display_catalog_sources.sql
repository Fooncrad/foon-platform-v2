-- Link display creatives to live catalog/menu records so title, image and price stay current.
ALTER TABLE display_slides
 ADD COLUMN source_type ENUM('media','restaurant_menu_item','catalog_product','restaurant_menu_category','catalog_category') NOT NULL DEFAULT 'media' AFTER media_url,
 ADD COLUMN source_id VARCHAR(36) NULL AFTER source_type,
 ADD KEY display_slides_source_idx (tenant_id,source_type,source_id);
