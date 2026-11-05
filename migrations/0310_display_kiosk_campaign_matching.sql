ALTER TABLE display_screens
 ADD COLUMN kiosk_pin_salt CHAR(32) NULL AFTER display_layout,
 ADD COLUMN kiosk_pin_hash CHAR(128) NULL AFTER kiosk_pin_salt,
 ADD COLUMN kiosk_failed_attempts INT NOT NULL DEFAULT 0 AFTER kiosk_pin_hash,
 ADD COLUMN kiosk_locked_until DATETIME NULL AFTER kiosk_failed_attempts;

ALTER TABLE display_slides
 ADD COLUMN campaign_match_key VARCHAR(80) NULL AFTER badge_text,
 ADD KEY display_slides_campaign_match_idx (screen_id, campaign_match_key, enabled, sort_order);
