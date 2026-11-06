-- 0162: explicitly grant the Business/Enterprise (enterprise) plan display advertising
-- for every supported activity. This is a plan-level capability; no tenant data
-- or subscriptions are changed. Re-running the migration preserves the same grant.
INSERT IGNORE INTO package_features
 (feature_key,name_ar,name_en,category,value_type)
VALUES
 ('display_advertising','إعلانات الشاشات','Display advertising','media','boolean');

INSERT INTO package_plan_features(plan_id,feature_key,enabled,limit_value)
SELECT p.id,'display_advertising',TRUE,NULL
FROM package_plans p
WHERE p.code='enterprise'
ON DUPLICATE KEY UPDATE enabled=TRUE,limit_value=NULL;

INSERT INTO package_plan_activity_features
 (plan_id,activity_code,feature_key,enabled,limit_value)
SELECT p.id,a.activity_code,'display_advertising',TRUE,NULL
FROM package_plans p
CROSS JOIN (
 SELECT 'restaurant' AS activity_code
 UNION ALL SELECT 'cafe'
 UNION ALL SELECT 'sweets'
 UNION ALL SELECT 'grocery'
 UNION ALL SELECT 'clothing'
 UNION ALL SELECT 'perfume'
 UNION ALL SELECT 'accessories'
 UNION ALL SELECT 'watches'
 UNION ALL SELECT 'gifts'
 UNION ALL SELECT 'ecommerce'
 UNION ALL SELECT 'carwash'
 UNION ALL SELECT 'laundry'
 UNION ALL SELECT 'automotive'
 UNION ALL SELECT 'salon'
 UNION ALL SELECT 'publicworks'
) AS a
WHERE p.code='enterprise'
ON DUPLICATE KEY UPDATE enabled=TRUE,limit_value=NULL;
