import Link from "next/link";
import {defaultTemplateForActivity,isTemplateForActivity} from "@/lib/platform/activity-templates";
import {isActivityType,type ActivityLanguage} from "@/lib/platform/activity-presets";

const headings:Record<ActivityLanguage,{account:string;register:string;browse:string;services:string;coming:string;shop:string}>={
 ar:{account:"حسابي",register:"إنشاء حساب",browse:"استكشف المنتجات",services:"استكشف الخدمات",coming:"سيتم عرض المنتجات والخدمات المنشورة هنا",shop:"واجهة النشاط"},
 en:{account:"My account",register:"Create account",browse:"Browse products",services:"Browse services",coming:"Published products and services will appear here",shop:"Business storefront"},
 fr:{account:"Mon compte",register:"Créer un compte",browse:"Voir les produits",services:"Voir les services",coming:"Les produits et services publiés apparaîtront ici",shop:"Vitrine de l’activité"}
};
const activityNames:Record<string,Record<ActivityLanguage,string>>={
 grocery:{ar:"سوبر ماركت",en:"Supermarket",fr:"Supermarché"},
 clothing:{ar:"أزياء وملابس",en:"Clothing & fashion",fr:"Mode et vêtements"},
 perfume:{ar:"العطور",en:"Perfumes",fr:"Parfums"},
 accessories:{ar:"الإكسسوارات",en:"Accessories",fr:"Accessoires"},
 gifts:{ar:"الهدايا",en:"Gifts",fr:"Cadeaux"},
 ecommerce:{ar:"المتجر الإلكتروني",en:"Online shop",fr:"Boutique en ligne"},
 carwash:{ar:"غسيل السيارات",en:"Car wash",fr:"Lavage auto"},
 laundry:{ar:"المغسلة",en:"Laundry",fr:"Blanchisserie"},
 automotive:{ar:"خدمات السيارات",en:"Automotive services",fr:"Services automobiles"},
 salon:{ar:"الصالون",en:"Beauty salon",fr:"Salon de beauté"},
 publicworks:{ar:"الخدمات والمشاريع",en:"Services and projects",fr:"Services et projets"}
};
const serviceActivities=new Set(["carwash","laundry","automotive","salon","publicworks"]);
export default function ActivityStorefront({name,slug,activity,template,language="ar"}:{name:string;slug:string;activity:string;template?:string|null;language?:ActivityLanguage}){
 const t=headings[language],service=serviceActivities.has(activity);
 const chosen=template&&isTemplateForActivity(activity,template)?template:defaultTemplateForActivity(activity);
 const title=activityNames[activity]?.[language]??t.shop;
 const layout=chosen?.endsWith("grid")?"grid":chosen?.includes("gallery")?"gallery":service?"services":"featured";
 return <main className={"foonActivityStorefront foonActivityStorefront-"+layout} data-activity={isActivityType(activity)?activity:"unknown"} data-template={chosen??"unassigned"} dir={language==="ar"?"rtl":"ltr"} lang={language} style={{minHeight:"100vh",background:"#f8fafc",color:"#172033",fontFamily:"inherit"}}>
  <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",padding:"18px clamp(16px,4vw,64px)",background:"#fff",borderBottom:"1px solid #e2e8f0"}}>
   <Link href={"/"+encodeURIComponent(slug)} style={{fontWeight:800,color:"inherit",textDecoration:"none"}}>{name}</Link>
   <nav aria-label={t.shop} style={{display:"flex",gap:18}}><Link href={"/"+encodeURIComponent(slug)+"/login"}>{t.account}</Link><Link href={"/"+encodeURIComponent(slug)+"/register"}>{t.register}</Link></nav>
  </header>
  <section style={{padding:"clamp(40px,7vw,90px) clamp(16px,5vw,72px)",background:service?"#e8f3f1":"#edf2fa"}}>
   <p style={{fontSize:14,letterSpacing:1,margin:0}}>{title}</p>
   <h1 style={{fontSize:"clamp(30px,5vw,56px)",lineHeight:1.2,margin:"12px 0"}}>{name}</h1>
   <p style={{fontSize:18}}>{service?t.services:t.browse}</p>
  </section>
  <section aria-label={service?t.services:t.browse} style={{maxWidth:1200,margin:"0 auto",padding:"36px 20px"}}>
   <h2 style={{fontSize:24}}>{service?t.services:t.browse}</h2>
   <p style={{padding:"28px 18px",background:"#fff",border:"1px solid #e2e8f0",borderRadius:16}}>{t.coming}</p>
  </section>
 </main>;
}
