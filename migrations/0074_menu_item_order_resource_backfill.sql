-- Backfill the legacy resource reference required by restaurant_order_items.
-- Add missing rows only; never overwrite existing resources or catalog records.
-- Abort if a menu item ID is already occupied by a resource of another tenant/kind.
INSERT INTO restaurant_resources (id,tenant_id,branch_id,kind,name,status,data,archived)
SELECT mi.id,mi.tenant_id,NULL,'menu_item',mi.name,'active',JSON_OBJECT('categoryId',mi.category_id),0
FROM restaurant_menu_items mi
LEFT JOIN restaurant_resources rr ON rr.id=mi.id
WHERE rr.id IS NULL;
