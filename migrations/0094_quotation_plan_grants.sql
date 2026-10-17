-- Add the feature actually used by quotations and service orders.
-- Idempotent, additive and safe for existing customized plans/subscriptions.
-- Existing plan feature rows and per-activity overrides are never overwritten.
INSERT IGNORE INTO package_features
 (feature_key,name_ar,name_en,category,value_type)
VALUES
 ('quotes','عروض الأسعار وأوامر الخدمة','Quotations and service orders','services','boolean');

-- Professional and Enterprise have formal quotations/service orders.
-- Incoming customer service inquiries remain available under their own
-- catalog entitlement; free and starter do not acquire paid quote grants.
INSERT IGNORE INTO package_plan_features
 (plan_id,feature_key,enabled,limit_value)
SELECT p.id,'quotes',
 CASE WHEN p.code IN ('professional','enterprise') THEN TRUE ELSE FALSE END,
 NULL
FROM package_plans p
WHERE p.code IN ('free','starter','professional','enterprise');
