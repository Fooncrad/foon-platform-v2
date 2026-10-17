import Link from "next/link";
import {checkoutPolicy} from "@/lib/restaurant/checkout-pricing";
import StorefrontInfo from "./storefront-info";
import StorefrontQr from "./storefront-qr";
import ServiceRequestAction from "./service-request-action";
import StorefrontCart,{StorefrontAddButton} from "./storefront-cart";
import {customerCartAvailable,customerCheckout} from "@/lib/platform/customer-checkout";
import StorefrontLanguageSwitcher from "./storefront-language-switcher";
import "./activity-storefront.css";
import {defaultTemplateForActivity,isTemplateForActivity} from "@/lib/platform/activity-templates";
import {isActivityType,type ActivityLanguage} from "@/lib/platform/activity-presets";

const headings:Record<ActivityLanguage,{account:string;register:string;browse:string;services:string;coming:string;shop:string}>={
 ar:{account:"حسابي",register:"إنشاء حساب",browse:"استكشف المنتجات",services:"استكشف الخدمات",coming:"سيتم عرض المنتجات والخدمات المنشورة هنا",shop:"واجهة النشاط"},
 en:{account:"My account",register:"Create account",browse:"Browse products",services:"Browse services",coming:"Published products and services will appear here",shop:"Business storefront"},
 fr:{account:"Mon compte",register:"Créer un compte",browse:"Voir les produits",services:"Voir les services",coming:"Les produits et services publiés apparaîtront ici",shop:"Vitrine de l’activité"}
};
const activityNames:Record<string,Record<ActivityLanguage,string>>={
 cafe:{ar:"المقهى",en:"Café",fr:"Café"},
 sweets:{ar:"الحلويات والمخبوزات",en:"Sweets & bakery",fr:"Pâtisserie et boulangerie"},
 grocery:{ar:"سوبر ماركت",en:"Supermarket",fr:"Supermarché"},
 clothing:{ar:"أزياء وملابس",en:"Clothing & fashion",fr:"Mode et vêtements"},
 perfume:{ar:"العطور",en:"Perfumes",fr:"Parfums"},
 accessories:{ar:"الإكسسوارات",en:"Accessories",fr:"Accessoires"},
 watches:{ar:"الساعات",en:"Watches",fr:"Montres"},
 gifts:{ar:"الهدايا",en:"Gifts",fr:"Cadeaux"},
 ecommerce:{ar:"المتجر الإلكتروني",en:"Online shop",fr:"Boutique en ligne"},
 carwash:{ar:"غسيل السيارات",en:"Car wash",fr:"Lavage auto"},
 laundry:{ar:"المغسلة",en:"Laundry",fr:"Blanchisserie"},
 automotive:{ar:"خدمات السيارات",en:"Automotive services",fr:"Services automobiles"},
 salon:{ar:"الصالون",en:"Beauty salon",fr:"Salon de beauté"},
 publicworks:{ar:"الخدمات والمشاريع",en:"Services and projects",fr:"Services et projets"}
};
const serviceActivities=new Set(["carwash","laundry","automotive","salon","publicworks"]);
type ServiceRequestMode="appointment"|"quote"|"inquiry";
type StorefrontCategory={description?:string;imageUrl?:string|null;id:string;name:string;nameEn:string;nameFr:string};
type StorefrontProduct={description?:string;measured?:boolean;unit?:string;productType?:string;id:string;name:string;nameEn:string;nameFr:string;category:string;price:number;currency:string;imageUrl:string|null};
export default function ActivityStorefront({name,slug,activity,template,branding={},signedIn=false,linked=false,checkoutEnabled=false,requestMode=null,customerPhone="",deliveryAddress="",language="ar",products=[],categories=[],selectedCategory="",search="",page=1,total=0,pageSize=24,catalogError=false}:{branding?:Record<string,unknown>;name:string;slug:string;activity:string;signedIn?:boolean;linked?:boolean;checkoutEnabled?:boolean;requestMode?:ServiceRequestMode|null;customerPhone?:string;deliveryAddress?:string;template?:string|null;language?:ActivityLanguage;products?:StorefrontProduct[];categories?:StorefrontCategory[];selectedCategory?:string;search?:string;page?:number;total?:number;pageSize?:number;catalogError?:boolean}){
 const t=headings[language],service=serviceActivities.has(activity);
 const cart=checkoutEnabled&&customerCartAvailable(activity),serviceCart=customerCheckout(activity)==="service-cart";
 const callNumber=typeof branding.phone==="string"?branding.phone.replace(/[^0-9+]/g,""):"";
 const phone=/^\+?[0-9]{6,15}$/.test(callNumber)?callNumber:"";
 const contactLabel=activity==="publicworks"?(language==="ar"?"اتصل للاستفسار عن عرض سعر":language==="en"?"Call about a quotation":"Appeler pour un devis"):(language==="ar"?"اتصل للاستفسار أو الحجز":language==="en"?"Call to inquire or book":"Appeler pour un renseignement ou une réservation");
 const base="/"+encodeURIComponent(slug);
 const url=(category:string,number:number,q=search)=>{const params=new URLSearchParams();if(category)params.set("category",category);if(q)params.set("q",q);if(number>1)params.set("page",String(number));const suffix=params.toString();return base+(suffix?"?"+suffix:"")};
 const categoryName=(c:StorefrontCategory)=>language==="en"?c.nameEn||c.name:language==="fr"?c.nameFr||c.name:c.name;
 const localizedCategory=(value:string)=>{const match=categories.find(c=>c.id===value||c.name===value||c.nameEn===value||c.nameFr===value);return match?categoryName(match):value;};
 const pages=Math.ceil(total/pageSize);
 const visiblePage=Math.min(page,Math.max(1,pages));
 const chosen=template&&isTemplateForActivity(activity,template)?template:defaultTemplateForActivity(activity);
 const title=activityNames[activity]?.[language]??t.shop;
 const layout=chosen?.endsWith("grid")?"grid":chosen?.includes("gallery")?"gallery":service?"services":"featured";
 const accent=activity==="grocery"?"#23744b":activity==="perfume"?"#8052a2":activity==="clothing"?"#a64d62":activity==="salon"?"#ad4c83":service?"#147e80":"#3458a4";
 return <main className={"foonActivityStorefront foonActivityStorefront-"+layout} data-activity={isActivityType(activity)?activity:"unknown"} data-template={chosen??"unassigned"} dir={language==="ar"?"rtl":"ltr"} lang={language} style={{minHeight:"100vh",background:"#f8fafc",color:"#172033",fontFamily:"inherit",["--activity-accent" as string]:accent}}>
  <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",padding:"18px clamp(16px,4vw,64px)",background:"#fff",borderBottom:"1px solid #e2e8f0"}}>
   <Link href={"/"+encodeURIComponent(slug)} style={{fontWeight:800,color:"inherit",textDecoration:"none"}}>{name}</Link>
   <nav aria-label={t.shop} style={{display:"flex",gap:18,alignItems:"center",flexWrap:"wrap"}}><StorefrontQr slug={slug} name={name} language={language}/><StorefrontLanguageSwitcher language={language}/><Link href={"/"+encodeURIComponent(slug)+"/login"}>{t.account}</Link><Link href={"/"+encodeURIComponent(slug)+"/register"}>{t.register}</Link></nav>
  </header>
  <section className="foonActivityHero">
   <p style={{fontSize:14,letterSpacing:1,margin:0}}>{title}</p>
   <h1 style={{fontSize:"clamp(30px,5vw,56px)",lineHeight:1.2,margin:"12px 0"}}>{name}</h1>
   <p style={{fontSize:18}}>{service?t.services:t.browse}</p>
  </section>
  <section className="foonActivityContent" aria-label={service?t.services:t.browse}>
   <h2 style={{fontSize:24}}>{service?t.services:t.browse}</h2>
   <form action={base} method="get" className="foonActivitySearch"><input name="q" defaultValue={search} maxLength={100} aria-label={language==="ar"?"بحث المنتجات والخدمات":language==="fr"?"Rechercher des produits et services":"Search products and services"} placeholder={language==="ar"?"ابحث عن منتج أو خدمة":language==="fr"?"Rechercher":"Search products or services"}/>{selectedCategory&&<input type="hidden" name="category" value={selectedCategory}/>}<button type="submit">{language==="ar"?"بحث":language==="fr"?"Rechercher":"Search"}</button></form>
   <nav className="foonActivityCategories" aria-label={language==="ar"?"أقسام النشاط":language==="fr"?"Catégories":"Categories"}><Link aria-current={!selectedCategory?"page":undefined} href={url("",1)}>{language==="ar"?"الكل":language==="fr"?"Tout":"All"}</Link>{categories.map(c=><Link key={c.id} aria-current={selectedCategory===c.id?"page":undefined} href={url(c.id,1)}>{c.imageUrl&&<img src={c.imageUrl} alt="" width={36} height={36} style={{objectFit:"cover",borderRadius:8}}/>}{categoryName(c)}</Link>)}</nav>
   {selectedCategory&&categories.find(c=>c.id===selectedCategory)?.description&&<p style={{whiteSpace:"pre-wrap"}}>{categories.find(c=>c.id===selectedCategory)?.description}</p>}<p className="foonActivityCount">{language==="ar"?"عدد النتائج":language==="fr"?"Résultats":"Results"}: {total.toLocaleString("en-US")}</p>
   {catalogError?<div className="foonActivityEmpty" role="alert"><span aria-hidden="true">⚠</span><p>{language==="ar"?"تعذر تحميل المنتجات حاليًا. يرجى المحاولة لاحقًا.":language==="fr"?"Impossible de charger le catalogue. Réessayez plus tard.":"Unable to load the catalog. Please try again later."}</p></div>:products.length?<div className="foonActivityProducts">{products.map(product=><article className="foonActivityProduct" key={product.id}><div className="foonActivityProductMedia">{product.imageUrl?<img src={product.imageUrl} alt={language==="en"?product.nameEn||product.name:language==="fr"?product.nameFr||product.name:product.name} loading="lazy"/>:<span aria-hidden="true">▦</span>}</div><div className="foonActivityProductInfo"><small>{localizedCategory(product.category)}</small>{service&&<small className="foonActivityServiceTag">{product.productType==="physical"?(language==="ar"?"منتج":language==="en"?"Product":"Produit"):(language==="ar"?"خدمة":language==="en"?"Service":"Service")}</small>}<h3>{language==="en"?product.nameEn||product.name:language==="fr"?product.nameFr||product.name:product.name}</h3>{product.description&&<p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{product.description}</p>}<strong dir="ltr">{product.price.toFixed(2)} {product.currency}{product.measured?" / "+product.unit:""}</strong>{branding.vatEnabled==="yes"&&<small>{branding.menuStoredPricesIncludeVat==="yes"?(language==="ar"?"شامل الضريبة":language==="en"?"Tax included":"Taxe comprise"):(language==="ar"?"السعر قبل الضريبة":language==="en"?"Price before tax":"Prix hors taxe")}</small>}{cart&&<StorefrontAddButton slug={slug} id={product.id} language={language} service={serviceCart}/>}
 {service&&requestMode&&<ServiceRequestAction key={product.id+":"+requestMode} slug={slug} serviceId={product.id} serviceName={language==="en"?product.nameEn||product.name:language==="fr"?product.nameFr||product.name:product.name} mode={requestMode} language={language} signedIn={signedIn} linked={linked} defaultPhone={customerPhone}/>}
 {service&&!serviceCart&&phone&&<a className="foonActivityServicePhone" href={"tel:"+phone}>{contactLabel}</a>}</div></article>)}</div>:<div className="foonActivityEmpty"><span aria-hidden="true">{service?"◷":"▦"}</span><p>{t.coming}</p></div>}
   {pages>1&&<nav className="foonActivityPagination" aria-label={language==="ar"?"صفحات المنتجات":language==="fr"?"Pages des produits":"Product pages"}>{visiblePage>1&&<Link href={url(selectedCategory,visiblePage-1)}>{language==="ar"?"السابق":language==="fr"?"Précédent":"Previous"}</Link>}<span>{visiblePage.toLocaleString("en-US")} / {pages.toLocaleString("en-US")}</span>{visiblePage<pages&&<Link href={url(selectedCategory,visiblePage+1)}>{language==="ar"?"التالي":language==="fr"?"Suivant":"Next"}</Link>}</nav>}
  </section>
  {cart&&<StorefrontCart checkoutPolicy={checkoutPolicy(branding)} key={slug} slug={slug} language={language} signedIn={signedIn} linked={linked} customerPhone={customerPhone} deliveryAddress={deliveryAddress} service={serviceCart}/>}
 <StorefrontInfo slug={slug} branding={branding} language={language}/></main>;
}
