-- Preserve every restaurant's template; add independent light/dark preferences.
ALTER TABLE restaurant_menu_appearance ADD COLUMN color_mode ENUM('template','light','dark','system') NOT NULL DEFAULT 'template';
