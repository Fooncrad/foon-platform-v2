export const emailTemplateKeys=["subscription_renewal","payment_receipt","email_verification","password_reset"];
export const templateVariables=["subject","message","tenant_name"];
export const defaultEmailTemplates=[
 {template_key:"subscription_renewal",label:"تجديد الاشتراك",subject_template:"{{subject}}",body_template:"مرحبًا بكم في {{tenant_name}}،\n\nتم اعتماد تجديد اشتراك منشأتكم على FOON.\n{{message}}\n\nيمكنكم مراجعة تفاصيل الاشتراك من لوحة منشأتكم."},
 {template_key:"payment_receipt",label:"إيصال الدفع",subject_template:"{{subject}}",body_template:"مرحبًا بكم في {{tenant_name}}،\n\n{{message}}\n\nهذا إيصال إداري لتوثيق الدفع، وليس فاتورة ضريبية."},
 {template_key:"email_verification",label:"تأكيد البريد الإلكتروني",subject_template:"تأكيد البريد الإلكتروني — FOON",body_template:"مرحبًا،\n\nلإكمال تأكيد بريدكم الإلكتروني اتبعوا الرابط التالي:\n{{message}}\n\nإذا لم تطلبوا إنشاء الحساب، يمكنكم تجاهل هذه الرسالة."},
 {template_key:"password_reset",label:"استعادة كلمة المرور",subject_template:"استعادة كلمة المرور — FOON",body_template:"مرحبًا،\n\nوصلنا طلب لاستعادة كلمة مرور حسابكم. اتبعوا الرابط التالي:\n{{message}}\n\nإذا لم تطلبوا ذلك، تجاهلوا الرسالة. لا تشاركوا الرابط مع أي شخص."}
];
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function validateEmailTemplate(template) {
 return emailTemplateKeys.includes(template.template_key)&&
  typeof template.subject_template==="string"&&template.subject_template.trim().length>0&&template.subject_template.length<=250&&!/[\r\n]/.test(template.subject_template)&&
  typeof template.body_template==="string"&&template.body_template.trim().length>0&&template.body_template.length<=10000&&
  [...(template.subject_template+" "+template.body_template).matchAll(/{{\s*([^}]+?)\s*}}/g)].every(m=>templateVariables.includes(m[1]));
}
export function renderEmailTemplate(template,variables) {
 if(!validateEmailTemplate(template))throw Error("MAIL_TEMPLATE_INVALID");
 const replace=value=>value.replace(/{{\s*([^}]+?)\s*}}/g,(_,key)=>String(variables[key]??""));
 const subject=replace(template.subject_template).replace(/[\r\n]/g," ").slice(0,250);
 const text=replace(template.body_template)+"\n\nFOON · info@nfoodz.com";
 const html='<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;line-height:1.8;color:#172033"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px"><table role="presentation" style="max-width:600px;width:100%;background:white;border-radius:16px"><tr><td style="padding:28px;border-bottom:3px solid #e76f3c"><strong style="font-size:26px">FOON</strong><p>'+escapeHtml(variables.tenant_name||"منصة FOON")+'</p></td></tr><tr><td style="padding:28px"><h1 style="font-size:21px">'+escapeHtml(subject)+'</h1><div style="white-space:pre-line">'+escapeHtml(text)+'</div></td></tr></table></td></tr></table></body></html>';
 return {subject,text,html};
}
export function renderQueuedEmail(job,templates=defaultEmailTemplates) {
 const template=templates.find(t=>t.template_key===job.event_key)||{template_key:"subscription_renewal",subject_template:"{{subject}}",body_template:"{{message}}"};
 return renderEmailTemplate(template,{subject:job.subject,message:job.body_text,tenant_name:job.tenant_name||"منشأتكم"});
}
