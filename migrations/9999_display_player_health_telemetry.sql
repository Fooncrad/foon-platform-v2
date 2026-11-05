-- FOON 0157: record browser-reported player health without claiming native HDMI discovery.
ALTER TABLE display_screens
 ADD COLUMN player_health_json JSON NULL AFTER last_seen_at,
 ADD COLUMN player_health_at DATETIME NULL AFTER player_health_json,
 ADD COLUMN player_error_code VARCHAR(80) NULL AFTER player_health_at;
