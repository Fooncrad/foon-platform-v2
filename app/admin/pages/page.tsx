const pages=[
 ["من نحن","/about","منشورة","AR · EN · FR"],
 ["تواصل معنا","/contact","منشورة","AR · EN · FR"],
 ["الأسئلة الشائعة","/faq","منشورة","AR · EN · FR"],
 ["الشروط والأحكام","/terms","منشورة","AR · EN · FR"],
 ["سياسة الخصوصية","/privacy","منشورة","AR · EN · FR"],
 ["سياسة الاسترجاع","/refund","مسودة","AR · EN · FR"]
];
export default function PagesPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>صفحات الموقع</h1><p>إدارة صفحات FOON العامة ومحتواها متعدد اللغات وحالة النشر.</p></div><button className="adminPrimaryButton" type="button">إضافة صفحة</button></header>
  <section className="adminPanel">
   <div className="adminPanelHead"><div><h2>الصفحات العامة</h2><p>رتّب المحتوى وتابع حالة كل صفحة ومسارها واللغات المتاحة.</p></div><input aria-label="بحث في الصفحات" placeholder="بحث باسم الصفحة..." /></div>
   <div className="adminPageList">
    {pages.map(([name,path,status,languages])=><article className="adminPageRow" key={path}>
     <div><b>{name}</b><code>{path}</code></div>
     <span>{languages}</span><span className="adminStatusPill">{status}</span>
     <div className="adminRowActions"><button type="button">تحرير</button><button type="button">معاينة</button></div>
    </article>)}
   </div>
  </section>
 </main>
}