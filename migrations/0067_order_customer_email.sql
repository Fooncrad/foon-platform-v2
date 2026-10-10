-- Preserve walk-in contact details and populate account-backed historical orders.
ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(254) NULL;
UPDATE restaurant_orders o
JOIN tenant_customers tc ON tc.tenant_id=o.tenant_id AND tc.user_id=o.customer_user_id
JOIN users u ON u.id=tc.user_id
SET o.customer_email=u.email
WHERE o.customer_email IS NULL AND o.customer_user_id IS NOT NULL;
