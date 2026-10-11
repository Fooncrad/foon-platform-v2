-- Enable printing, workstation routing and invoicing for the Business (enterprise) plan.
-- Preserve grants for other tiers; safe to run repeatedly.
INSERT INTO package_plan_features (plan_id, feature_key, enabled, limit_value)
SELECT p.id, f.feature_key, TRUE, NULL
FROM package_plans AS p
JOIN package_features AS f ON f.feature_key IN ('departments','department_printers','department_routing','customer_invoices','internal_invoices','invoice_printing')
WHERE p.code = 'enterprise'
ON DUPLICATE KEY UPDATE enabled = TRUE;
