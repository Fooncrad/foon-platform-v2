-- FOON 0156: make display advertising a dedicated cross-activity merchant entitlement.
-- Only Business/Enterprise receives the new capability by default. Existing
-- grants and per-activity overrides are preserved; no tenant data is changed.
INSERT IGNORE INTO package_features
 (feature_key,name_ar,name_en,category,value_type)
VALUES
 ('display_advertising','إعلانات الشاشات','Display advertising','media','boolean');

INSERT IGNORE INTO package_plan_features
 (plan_id,feature_key,enabled,limit_value)
SELECT p.id,'display_advertising',TRUE,NULL
FROM package_plans p
WHERE p.code='enterprise';
