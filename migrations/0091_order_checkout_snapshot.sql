-- Additive. Historical orders remain NULL; never invent historical taxes or fees.
ALTER TABLE restaurant_orders ADD COLUMN checkout_snapshot JSON NULL;
