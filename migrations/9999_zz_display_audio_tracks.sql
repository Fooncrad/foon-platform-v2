-- Add an optional tenant-owned audio bed to display slides. Existing campaigns remain silent.
ALTER TABLE display_slides
 ADD COLUMN audio_url VARCHAR(500) NULL AFTER media_url;
