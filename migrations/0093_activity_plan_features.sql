-- Per-activity overrides; absence inherits the shared plan. NULL limit is unlimited.
CREATE TABLE IF NOT EXISTS package_plan_activity_features (
 plan_id VARCHAR(36) NOT NULL,
 activity_code VARCHAR(32) NOT NULL,
 feature_key VARCHAR(100) NOT NULL,
 enabled BOOLEAN NOT NULL,
 limit_value INT UNSIGNED NULL,
 PRIMARY KEY(plan_id,activity_code,feature_key),
 CONSTRAINT fk_activity_grant_plan FOREIGN KEY(plan_id) REFERENCES package_plans(id),
 CONSTRAINT fk_activity_grant_feature FOREIGN KEY(feature_key) REFERENCES package_features(feature_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every activity starts free, with a bounded catalog. Preserve explicit disables
-- and any smaller existing limit. Existing paid plans/subscriptions are unchanged.
INSERT IGNORE INTO package_plan_activity_features(plan_id,activity_code,feature_key,enabled,limit_value)
SELECT p.id,a.activity_code,pf.feature_key,pf.enabled,
 CASE WHEN pf.feature_key IN ('digital_menu','catalog') THEN LEAST(COALESCE(pf.limit_value,20),20) ELSE pf.limit_value END
FROM package_plans p JOIN package_plan_features pf ON pf.plan_id=p.id
CROSS JOIN (SELECT 'restaurant' AS activity_code UNION ALL SELECT 'cafe' UNION ALL SELECT 'sweets' UNION ALL SELECT 'grocery' UNION ALL SELECT 'clothing' UNION ALL SELECT 'perfume' UNION ALL SELECT 'accessories' UNION ALL SELECT 'watches' UNION ALL SELECT 'gifts' UNION ALL SELECT 'ecommerce' UNION ALL SELECT 'carwash' UNION ALL SELECT 'laundry' UNION ALL SELECT 'automotive' UNION ALL SELECT 'salon' UNION ALL SELECT 'publicworks') a
WHERE p.code='free';
