export default function PagesPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>صفحات الموقع</h1><p>الصفحات العامة والمحتوى متعدد اللغات وحالة النشر.</p></div></header>
  <section className="adminPanel"><div className="adminPanelHead"><div><h2>إدارة المحتوى</h2><p>لم تُربط لوحة الصفحات بعد ببيانات منشورة أو مسودات محفوظة.</p></div></div>
   <div className="adminUsersEmpty" role="status"><b>محرر الصفحات غير مفعّل</b><p>لا تُعرض صفحات نموذجية على أنها منشورة، ولا أزرار تحرير ومعاينة لا تعمل. يتطلب التفعيل حفظ المحتوى متعدد اللغات والتحقق من النشر ومسارات العرض العامة.</p></div>
  </section>
 </main>;
}
