-- Existing orders retain nullable dining context; new dine-in orders require it in the API.
ALTER TABLE restaurant_orders
  ADD COLUMN IF NOT EXISTS dining_section_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS party_size INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS dining_snapshot JSON NULL;
