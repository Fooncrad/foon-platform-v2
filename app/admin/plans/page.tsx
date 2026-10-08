export default function PlansPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>الباقات والاشتراكات</h1><p>إدارة الخطط والأسعار ودورات الفوترة ومزايا الاشتراك.</p></div></header>
  <section className="adminPanel"><div className="adminPanelHead"><div><h2>إعداد الباقات</h2><p>هذا القسم غير متصل بعد بكتالوج باقات محفوظ أو نظام فوترة فعلي. لن تُعرض أسعار أو حالات اشتراك افتراضية.</p></div></div>
   <div className="adminUsersEmpty" role="status"><b>إدارة الباقات غير مفعّلة حاليًا</b><p>يتطلب التفعيل جداول الخطط والأسعار والاشتراكات وواجهات API محمية قبل إتاحة إنشاء الباقات أو تعديلها.</p></div>
  </section>
 </main>;
}
