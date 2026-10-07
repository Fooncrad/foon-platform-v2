const rows=[
 ["nav.home","الرئيسية","Home","Accueil","مكتمل"],
 ["nav.stores","المتاجر","Stores","Boutiques","مكتمل"],
 ["auth.login","تسجيل الدخول","Sign in","Connexion","مكتمل"],
 ["common.save","حفظ","Save","Enregistrer","مكتمل"],
 ["common.cancel","إلغاء","Cancel","Annuler","مكتمل"]
];
export default function TranslationsPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>الترجمات</h1><p>إدارة مفاتيح العربية والإنجليزية والفرنسية مع مراجعة اكتمال كل لغة.</p></div><button className="adminPrimaryButton" type="button">إضافة مفتاح</button></header>
  <section className="adminTranslationStats"><article><span>المفاتيح</span><strong>—</strong></article><article><span>العربية</span><strong>100%</strong></article><article><span>English</span><strong>100%</strong></article><article><span>Français</span><strong>100%</strong></article></section>
  <section className="adminPanel">
   <div className="adminPanelHead"><div><h2>مفاتيح الواجهة</h2><p>ابحث بالمفتاح أو النص وراجع اللغات جنبًا إلى جنب.</p></div><div className="adminTranslationFilters"><input aria-label="بحث في الترجمات" placeholder="بحث بالمفتاح أو النص..." /><select aria-label="حالة الترجمة" defaultValue="all"><option value="all">كل الحالات</option><option>مكتمل</option><option>ناقص</option></select></div></div>
   <div className="adminTranslationTable" role="table" aria-label="الترجمات">
    <div className="adminTranslationRow adminTranslationHead" role="row"><b>المفتاح</b><b>العربية</b><b>English</b><b>Français</b><b>الحالة</b></div>
    {rows.map(([key,ar,en,fr,status])=><div className="adminTranslationRow" role="row" key={key}><code>{key}</code><span>{ar}</span><span dir="ltr">{en}</span><span dir="ltr">{fr}</span><span className="adminTranslationStatus">{status}</span></div>)}
   </div>
  </section>
 </main>
}