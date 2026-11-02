-- Registered hotel rooms are stored in tenant/branch scoped restaurant_resources.
-- Add the order channel and plan catalog grant without changing existing grants.
ALTER TABLE restaurant_orders
 MODIFY channel ENUM('dine_in','takeaway','delivery','room_service') NOT NULL DEFAULT 'dine_in';

INSERT IGNORE INTO package_features(feature_key,name_ar,name_en,category,value_type)
VALUES ('room_service','خدمة الغرف','Room service','operations','boolean');

-- Professional and Business (enterprise) plans include room service.
-- INSERT IGNORE preserves administrator-edited grants and limits.
INSERT IGNORE INTO package_plan_features(plan_id,feature_key,enabled,limit_value)
SELECT id,'room_service',TRUE,NULL
FROM package_plans
WHERE code IN ('professional','enterprise');
