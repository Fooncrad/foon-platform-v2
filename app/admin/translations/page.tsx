export default function TranslationsPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>الترجمات</h1><p>مفاتيح واجهات العربية والإنجليزية والفرنسية.</p></div></header>
  <section className="adminPanel"><div className="adminPanelHead"><div><h2>محرر الترجمة</h2><p>المحرر غير متصل بعد بمصدر مفاتيح لغوي دائم.</p></div></div>
   <div className="adminUsersEmpty" role="status"><b>الترجمات غير جاهزة للإدارة</b><p>لن تُعرض نسبة اكتمال 100% أو مفاتيح نموذجية باعتبارها ترجمات فعلية. يتطلب التشغيل مصدرًا حقيقيًا للمفاتيح وواجهة حفظ ومراجعة لكل لغة.</p></div>
  </section>
 </main>;
}
