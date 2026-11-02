-- Order notes are entered by POS and shown to authorized restaurant staff.
ALTER TABLE restaurant_orders
  ADD COLUMN kitchen_notes TEXT NULL,
  ADD COLUMN order_notes TEXT NULL;
