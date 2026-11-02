-- Additive stock tracking for restaurant menu add-ons, matching shared catalog values.
-- NULL means unlimited. Zero means out of stock. Existing records remain unlimited.
ALTER TABLE restaurant_menu_option_values
 ADD COLUMN stock_quantity DECIMAL(12,3) NULL DEFAULT NULL;
