const pages=[
 ["من نحن","/about","منشورة","AR · EN · FR","اليوم"],
 ["تواصل معنا","/contact","منشورة","AR · EN · FR","اليوم"],
 ["الأسئلة الشائعة","/faq","منشورة","AR · EN · FR","أمس"],
 ["الشروط والأحكام","/terms","منشورة","AR · EN · FR","أمس"],
 ["سياسة الخصوصية","/privacy","منشورة","AR · EN · FR","أمس"],
 ["سياسة الاسترجاع","/refund","مسودة","AR · EN · FR","—"]
];
export default function PagesPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>صفحات الموقع</h1><p>إدارة الصفحات العامة والمحتوى متعدد اللغات وحالة النشر من مكان واحد.</p></div><button className="adminPrimaryButton" type="button">إضافة صفحة</button></header>
  <section className="adminPageStats"><article><span>إجمالي الصفحات</span><strong>{pages.length}</strong></article><article><span>منشورة</span><strong>{pages.filter(p=>p[2]==="منشورة").length}</strong></article><article><span>مسودات</span><strong>{pages.filter(p=>p[2]==="مسودة").length}</strong></article></section>
  <section className="adminPanel">
   <div className="adminPanelHead"><div><h2>الصفحات العامة</h2><p>تابع المسار واللغات وحالة النشر وآخر تحديث.</p></div><div className="adminPageFilters"><input aria-label="بحث في الصفحات" placeholder="بحث باسم الصفحة..." /><select aria-label="حالة الصفحة" defaultValue="all"><option value="all">كل الحالات</option><option>منشورة</option><option>مسودة</option></select></div></div>
   <div className="adminPageList">{pages.map(([name,path,status,languages,updated])=><article className="adminPageRow" key={path}><div><b>{name}</b><code>{path}</code></div><span>{languages}</span><span className={"adminStatusPill "+(status==="منشورة"?"isPublished":"isDraft")}>{status}</span><time>{updated}</time><div className="adminRowActions"><button type="button">تحرير</button><button type="button">معاينة</button></div></article>)}</div>
  </section>
 </main>
}