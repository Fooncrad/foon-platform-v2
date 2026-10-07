const rows=[
 ["nav.home","الرئيسية","Home","Accueil"],
 ["nav.stores","المتاجر","Stores","Boutiques"],
 ["auth.login","تسجيل الدخول","Sign in","Connexion"],
 ["common.save","حفظ","Save","Enregistrer"],
 ["common.cancel","إلغاء","Cancel","Annuler"]
];
export default function TranslationsPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>الترجمات</h1><p>محرر موحّد لمفاتيح العربية والإنجليزية والفرنسية مع إبقاء العربية مستقلة عن بقية اللغات.</p></div><button className="adminPrimaryButton" type="button">إضافة مفتاح</button></header>
  <section className="adminPanel">
   <div className="adminPanelHead"><div><h2>مفاتيح الواجهة</h2><p>ابحث وراجع النصوص قبل اعتمادها في الواجهة.</p></div><input aria-label="بحث في الترجمات" placeholder="بحث بالمفتاح أو النص..." /></div>
   <div className="adminTranslationTable" role="table" aria-label="الترجمات">
    <div className="adminTranslationRow adminTranslationHead" role="row"><b>المفتاح</b><b>العربية</b><b>English</b><b>Français</b></div>
    {rows.map(([key,ar,en,fr])=><div className="adminTranslationRow" role="row" key={key}><code>{key}</code><span>{ar}</span><span dir="ltr">{en}</span><span dir="ltr">{fr}</span></div>)}
   </div>
  </section>
 </main>
}