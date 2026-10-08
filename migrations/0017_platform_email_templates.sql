CREATE TABLE IF NOT EXISTS platform_email_templates (
 template_key VARCHAR(80) NOT NULL PRIMARY KEY,
 subject_template VARCHAR(250) NOT NULL,
 body_template TEXT NOT NULL,
 updated_by VARCHAR(36) NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_email_template_editor FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO platform_email_templates(template_key,subject_template,body_template) VALUES
('subscription_renewal','{{subject}}','مرحبًا بكم في {{tenant_name}}،

تم اعتماد تجديد اشتراك منشأتكم على FOON.
{{message}}

يمكنكم مراجعة التفاصيل من لوحة منشأتكم.'),
('payment_receipt','{{subject}}','مرحبًا بكم في {{tenant_name}}،

{{message}}

هذا إيصال إداري لتوثيق الدفع، وليس فاتورة ضريبية.'),
('email_verification','تأكيد البريد الإلكتروني — FOON','مرحبًا،

لإكمال تأكيد بريدكم اتبعوا الرابط التالي:
{{message}}

إذا لم تطلبوا إنشاء الحساب، تجاهلوا الرسالة.'),
('password_reset','استعادة كلمة المرور — FOON','مرحبًا،

وصلنا طلب لاستعادة كلمة المرور. اتبعوا الرابط التالي:
{{message}}

إذا لم تطلبوا ذلك، تجاهلوا الرسالة. لا تشاركوا الرابط مع أحد.')
ON DUPLICATE KEY UPDATE template_key=VALUES(template_key);
