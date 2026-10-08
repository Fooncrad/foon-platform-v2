-- Seed the default plan without overwriting administrator edits or paid subscriptions.
INSERT INTO package_plans(id,code,name_ar,name_en,name_fr,sort_order)
SELECT UUID(),'free','مجانية','Free','Gratuit',0
WHERE NOT EXISTS (SELECT 1 FROM package_plans WHERE code='free');

INSERT INTO package_features(feature_key,name_ar,name_en,category,value_type) VALUES
('digital_menu','المنيو الرقمي','Digital menu','menu','boolean'),
('qr_menu','منيو QR','QR menu','menu','boolean'),
('branding.logo','شعار النشاط','Logo','branding','boolean'),
('branding.colors','ألوان الهوية','Brand colors','branding','boolean'),
('storefront','واجهة المتجر','Storefront','store','boolean'),
('catalog','الكتالوج','Catalog','store','boolean'),
('orders','الطلبات','Orders','operations','boolean')
ON DUPLICATE KEY UPDATE feature_key=VALUES(feature_key);

INSERT INTO package_plan_features(plan_id,feature_key,enabled,limit_value)
SELECT p.id,f.feature_key,TRUE,NULL FROM package_plans p CROSS JOIN package_features f
WHERE p.code='free' AND f.feature_key IN ('digital_menu','qr_menu','branding.logo','branding.colors','storefront','catalog','orders')
ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id);

INSERT INTO tenant_subscriptions(id,tenant_id,plan_id,status,starts_at,ends_at)
SELECT UUID(),t.id,p.id,'active',NOW(),NULL FROM tenants t JOIN package_plans p ON p.code='free' AND p.enabled=TRUE
LEFT JOIN tenant_subscriptions s ON s.tenant_id=t.id
WHERE s.id IS NULL;

-- Only release legacy review gates for stores that already have an active owner.
UPDATE tenants t SET t.status='active'
WHERE t.status='pending' AND EXISTS (
 SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
 WHERE m.tenant_id=t.id AND m.role='owner' AND m.status='active' AND u.status='active'
);
