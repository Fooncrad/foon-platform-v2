const events=[
 ["تحديث متجر","المتاجر","تغيير حالة متجر","الآن"],
 ["تسجيل دخول إداري","الحساب","جلسة إدارة جديدة","منذ 8 دقائق"],
 ["تعديل إعداد","المنصة","تغيير إعداد عام","منذ 24 دقيقة"],
 ["إنشاء متجر","المتاجر","إضافة متجر جديد","اليوم"]
];
export default function AuditPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>سجل العمليات</h1><p>تتبّع واضح للتغييرات الإدارية والأحداث المهمة داخل المنصة.</p></div><button className="adminPrimaryButton" type="button">تصدير السجل</button></header>
  <section className="adminPanel">
   <div className="adminPanelHead"><div><h2>آخر العمليات</h2><p>استخدم البحث والتصنيف للوصول إلى الحدث المطلوب بسرعة.</p></div><div className="adminAuditFilters"><input aria-label="بحث في السجل" placeholder="بحث..." /><select aria-label="نوع العملية" defaultValue="all"><option value="all">كل العمليات</option><option>المتاجر</option><option>الحساب</option><option>المنصة</option></select></div></div>
   <div className="adminAuditList">{events.map(([title,scope,detail,time],i)=><article className="adminAuditRow" key={title+i}><span className="adminAuditDot" aria-hidden="true"/><div><b>{title}</b><p>{detail}</p></div><span className="adminStatusPill">{scope}</span><time>{time}</time><button type="button">التفاصيل</button></article>)}</div>
  </section>
 </main>
}