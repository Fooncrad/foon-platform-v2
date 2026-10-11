-- Backfill the legacy resource reference required by restaurant_order_items.
-- Add missing rows only; never overwrite existing resources or catalog records.
-- Existing ID collisions are skipped, not repaired; run scripts/check-edge-catalog.mjs\n-- and resolve cross-tenant/kind conflicts before enabling offline cloud order creation.
INSERT INTO restaurant_resources (id,tenant_id,branch_id,kind,name,status,data,archived)
SELECT mi.id,mi.tenant_id,NULL,'menu_item',mi.name,'active',JSON_OBJECT('categoryId',mi.category_id),0
FROM restaurant_menu_items mi
LEFT JOIN restaurant_resources rr ON rr.id=mi.id
WHERE rr.id IS NULL;
