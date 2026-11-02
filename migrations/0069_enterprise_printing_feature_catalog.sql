-- Register printing/invoicing features so they appear in Admin > Plans > Features.
INSERT INTO package_features(feature_key,name_ar,name_en,category,value_type) VALUES
('departments','الأقسام الداخلية ومحطات العمل','Internal departments and workstations','operations','boolean'),
('department_printers','طابعات الأقسام','Department printers','operations','boolean'),
('department_routing','توجيه الأصناف إلى الأقسام','Department item routing','operations','boolean'),
('customer_invoices','فواتير العملاء','Customer invoices','billing','boolean'),
('internal_invoices','الفواتير الداخلية','Internal invoices','billing','boolean'),
('invoice_printing','طباعة الفواتير','Invoice printing','billing','boolean')
ON DUPLICATE KEY UPDATE feature_key=VALUES(feature_key);

-- Add missing Enterprise grants; preserve explicit administrator overrides.
INSERT INTO package_plan_features(plan_id,feature_key,enabled,limit_value)
SELECT p.id,f.feature_key,TRUE,NULL FROM package_plans p
JOIN package_features f ON f.feature_key IN ('departments','department_printers','department_routing','customer_invoices','internal_invoices','invoice_printing')
WHERE p.code='enterprise'
ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id);
