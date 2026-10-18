ALTER TABLE restaurant_orders
 ADD COLUMN reservation_id VARCHAR(36) NULL AFTER table_id,
 ADD UNIQUE KEY uq_restaurant_order_reservation (tenant_id,reservation_id),
 ADD CONSTRAINT fk_restaurant_order_reservation
  FOREIGN KEY (tenant_id,reservation_id) REFERENCES restaurant_resources(tenant_id,id)
  ON DELETE RESTRICT;
