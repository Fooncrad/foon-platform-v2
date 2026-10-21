-- 0106: persist the explicit Business/Enterprise merchant grants instead of
-- treating a missing row as enabled. Apply before deploying the fail-closed
-- tenantEntitlement change. Existing disabled grants and activity overrides
-- are not overwritten. Catalog registration is not proof of runtime delivery.
-- Creator-only rights belong to creator accounts, not merchant subscriptions.
INSERT IGNORE INTO package_features
 (feature_key,name_ar,name_en,category,value_type)
VALUES
 ('digital_menu','المنيو الرقمي','Digital menu','menu','boolean'),
 ('qr_menu','منيو QR','QR menu','menu','boolean'),
 ('nfc_menu','منيو NFC','NFC menu','menu','boolean'),
 ('menu_templates','قوالب المنيو','Menu templates','branding','boolean'),
 ('orders','الطلبات','Orders','operations','boolean'),
 ('pos','نقاط البيع','POS','operations','boolean'),
 ('kds','شاشة المطبخ','Kitchen display','operations','boolean'),
 ('departments','الأقسام الداخلية ومحطات العمل','Internal departments and workstations','operations','boolean'),
 ('department_printers','طابعات الأقسام','Department printers','operations','boolean'),
 ('department_routing','توجيه الأصناف إلى الأقسام','Department item routing','operations','boolean'),
 ('internal_invoices','الفواتير الداخلية والمشتريات','Internal invoices','billing','boolean'),
 ('customer_invoices','فواتير العملاء','Customer invoices','billing','boolean'),
 ('split_bills','تقسيم الفواتير','Split bills','billing','boolean'),
 ('split_bill_requests','طلب تقسيم الفاتورة من العميل','Customer split bill requests','billing','boolean'),
 ('invoice_printing','طباعة الفواتير','Invoice printing','billing','boolean'),
 ('credit_notes','الإشعارات الدائنة والمرتجعات','Credit notes and returns','billing','boolean'),
 ('tables','الطاولات','Tables','operations','boolean'),
 ('waiter_call','نداء النادل','Waiter call','operations','boolean'),
 ('reservations','الحجوزات','Reservations','operations','boolean'),
 ('waitlist','قائمة الانتظار','Waitlist','operations','boolean'),
 ('reservation_fees','رسوم خدمة الحجوزات','Reservation service fees','operations','boolean'),
 ('waitlist_fees','رسوم خدمة الانتظار','Waitlist service fees','operations','boolean'),
 ('table_qr','رمز QR لكل طاولة','Table QR codes','operations','boolean'),
 ('table_minimum_charge','الحد الأدنى لطلب الطاولة','Table minimum charge','operations','boolean'),
 ('service_fees','رسوم الخدمات التشغيلية','Operational service fees','operations','boolean'),
 ('vat_management','إدارة ضريبة القيمة المضافة','VAT management','billing','boolean'),
 ('excise_tax','الضريبة الانتقائية','Excise tax','billing','boolean'),
 ('delivery','التوصيل','Delivery','operations','boolean'),
 ('takeaway','السفري','Takeaway','operations','boolean'),
 ('room_service','خدمة الغرف','Room service','operations','boolean'),
 ('employees','الموظفون','Employees','management','boolean'),
 ('inventory','المخزون','Inventory','management','boolean'),
 ('purchases','المشتريات','Purchases','management','boolean'),
 ('suppliers','الموردون','Suppliers','management','boolean'),
 ('loyalty','الولاء','Loyalty','marketing','boolean'),
 ('coupons','الكوبونات','Coupons','marketing','boolean'),
 ('campaigns','الحملات','Campaigns','marketing','boolean'),
 ('reviews','التقييمات','Reviews','marketing','boolean'),
 ('analytics','التحليلات','Analytics','reports','boolean'),
 ('multi_branch','تعدد الفروع','Multiple branches','management','boolean'),
 ('content_library','مكتبة المحتوى','Content library','media','boolean'),
 ('storage','التخزين','Storage','limits','boolean'),
 ('storefront','واجهة المتجر','Storefront','store','boolean'),
 ('catalog','الكتالوج','Catalog','store','boolean'),
 ('variants','خيارات المنتجات','Product variants','store','boolean'),
 ('pickup','الاستلام','Pickup','store','boolean'),
 ('customers','العملاء','Customers','management','boolean'),
 ('quotes','عروض الأسعار وأوامر الخدمة','Quotations and service orders','services','boolean'),
 ('service_catalog','كتالوج الخدمات','Service catalog','services','boolean'),
 ('appointments','المواعيد','Appointments','services','boolean'),
 ('queue','الطابور','Queue','services','boolean'),
 ('payments','المدفوعات','Payments','billing','boolean'),
 ('creator_profile','ملف صانع المحتوى','Creator profile','creator','boolean'),
 ('content_marketplace','سوق المحتوى','Content marketplace','creator','boolean'),
 ('media_library','مكتبة الوسائط','Media library','creator','boolean'),
 ('watermark','العلامة المائية','Watermark','creator','boolean'),
 ('content_pricing','تسعير المحتوى','Content pricing','creator','boolean'),
 ('sales','المبيعات','Sales','creator','boolean'),
 ('branding.logo','شعار النشاط','Logo','branding','boolean'),
 ('branding.colors','ألوان الهوية','Brand colors','branding','boolean'),
 ('branding.dark_mode','الوضع الداكن','Dark mode','branding','boolean'),
 ('branding.menu_theme','قالب المنيو','Menu theme','branding','boolean'),
 ('branding.custom_font','الخط المخصص','Custom font','branding','boolean'),
 ('branding.qr','تخصيص QR','QR branding','branding','boolean'),
 ('branding.remove_nfood','إخفاء علامة FOON','Remove FOON branding','branding','boolean'),
 ('branding.custom_domain','نطاق مخصص','Custom domain','branding','boolean'),
 ('branding.white_label','علامة تجارية مستقلة','White label','branding','boolean');

INSERT IGNORE INTO package_plan_features
 (plan_id,feature_key,enabled,limit_value)
SELECT p.id,f.feature_key,TRUE,NULL
FROM package_plans p
JOIN package_features f ON f.feature_key IN (
 'digital_menu', 'qr_menu', 'nfc_menu', 'menu_templates', 'orders', 'pos', 'kds', 'departments', 'department_printers', 'department_routing', 'internal_invoices', 'customer_invoices', 'split_bills', 'split_bill_requests', 'invoice_printing', 'credit_notes', 'tables', 'waiter_call', 'reservations', 'waitlist', 'reservation_fees', 'waitlist_fees', 'table_qr', 'table_minimum_charge', 'service_fees', 'vat_management', 'excise_tax', 'delivery', 'takeaway', 'room_service', 'employees', 'inventory', 'purchases', 'suppliers', 'loyalty', 'coupons', 'campaigns', 'reviews', 'analytics', 'multi_branch', 'content_library', 'storage', 'storefront', 'catalog', 'variants', 'pickup', 'customers', 'quotes', 'service_catalog', 'appointments', 'queue', 'payments', 'sales', 'branding.logo', 'branding.colors', 'branding.dark_mode', 'branding.menu_theme', 'branding.custom_font', 'branding.qr', 'branding.remove_nfood', 'branding.custom_domain', 'branding.white_label'
)
WHERE p.code='enterprise';
