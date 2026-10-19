import Link from "next/link";
import Image from "next/image";
import {checkoutPolicy} from "@/lib/restaurant/checkout-pricing";
import StorefrontInfo from "./storefront-info";
import ActivityProductDetails from "./activity-product-details";
import {defaultPublicControls,type PublicControls} from "@/lib/tenant/public-controls-core";
import StorefrontQr from "./storefront-qr";
import ServiceRequestAction from "./service-request-action";
import ServiceRequestHistory from "./service-request-history";
import StorefrontCart,{StorefrontAddButton} from "./storefront-cart";
import {customerCartAvailable,customerCheckout} from "@/lib/platform/customer-checkout";
import StorefrontLanguageSwitcher from "./storefront-language-switcher";
import StorefrontThemeToggle from "./storefront-theme-toggle";
import "./activity-storefront.css";
import "./storefront-refresh.css";
import "./unified-storefront-ux.css";
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
export default function ActivityStorefront({name,slug,activity,template,branding={},controls=defaultPublicControls,signedIn=false,linked=false,checkoutEnabled=false,requestMode=null,customerPhone="",deliveryAddress="",language="ar",products=[],categories=[],selectedCategory="",search="",page=1,total=0,pageSize=24,catalogError=false}:{branding?:Record<string,unknown>;controls?:PublicControls;name:string;slug:string;activity:string;signedIn?:boolean;linked?:boolean;checkoutEnabled?:boolean;requestMode?:ServiceRequestMode|null;customerPhone?:string;deliveryAddress?:string;template?:string|null;language?:ActivityLanguage;products?:StorefrontProduct[];categories?:StorefrontCategory[];selectedCategory?:string;search?:string;page?:number;total?:number;pageSize?:number;catalogError?:boolean}){
 const t=headings[language],service=serviceActivities.has(activity);
 const cart=controls.sales&&controls.cart&&controls.catalog&&checkoutEnabled&&customerCartAvailable(activity),serviceCart=customerCheckout(activity)==="service-cart";
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
 const colorMode=branding.colorMode==="dark"||branding.colorMode==="system"?String(branding.colorMode):"light";
 const coverUrl=typeof branding.coverUrl==="string"?branding.coverUrl:"";
 const openStatus=typeof branding.openStatus==="string"?branding.openStatus.toLowerCase():"";
 const title=activityNames[activity]?.[language]??t.shop;
 const layout=chosen?.endsWith("grid")?"grid":chosen?.includes("gallery")?"gallery":service?"services":"featured";
 const accent=activity==="grocery"?"#23744b":activity==="perfume"?"#8052a2":activity==="clothing"?"#a64d62":activity==="salon"?"#ad4c83":service?"#147e80":"#3458a4";
 return <main className={"foonActivityStorefront foonActivityStorefront-"+layout} data-public-catalog={controls.catalog?"on":"off"} data-public-search={controls.search?"on":"off"} data-public-categories={controls.categories?"on":"off"} data-activity={isActivityType(activity)?activity:"unknown"} data-template={chosen??"unassigned"} data-layout={layout} data-color-mode={colorMode} dir={language==="ar"?"rtl":"ltr"} lang={language} style={{["--activity-accent" as string]:accent}}>
  <header className="foonActivityHeader">
   <div className="foonActivityHeaderBrand"><Link href={"/"+encodeURIComponent(slug)} className="foonActivityStoreName">{Boolean(branding.iconUrl||branding.logoUrl)&&<img className="foonStorefrontBrandIcon" src={String(branding.iconUrl||branding.logoUrl)} alt="" width={36} height={36}/>}<span>{name}</span></Link><div className="foonActivityHeaderActions">{controls.qr&&<StorefrontQr slug={slug} name={name} language={language}/>}<StorefrontThemeToggle storageKey={"foon-storefront-theme:"+slug} language={language} defaultTheme={colorMode==="dark"?"dark":"light"}/><StorefrontLanguageSwitcher language={language}/></div></div>
   <nav className="foonActivityHeaderNav" aria-label={t.shop}>{(signedIn||controls.customerLogin)&&<Link href={signedIn?"/customer":"/"+encodeURIComponent(slug)+"/login"}>{t.account}</Link>}{!signedIn&&controls.customerLogin&&<Link href={"/"+encodeURIComponent(slug)+"/register"}>{t.register}</Link>}}</nav>
  </header>
  <section className="foonActivityHero">
   {coverUrl&&<Image className="foonActivityHeroImage" src={coverUrl} alt="" fill unoptimized sizes="100vw" priority/>}
   <p style={{fontSize:14,letterSpacing:1,margin:0}}>{title}</p>
   <h1 style={{fontSize:"clamp(30px,5vw,56px)",lineHeight:1.2,margin:"12px 0"}}>{name}</h1>
   <p style={{fontSize:18}}>{service?t.services:t.browse}</p>
  </section>
  <section className="foonActivityStoreMeta" aria-label={language==="ar"?"معلومات المتجر":language==="fr"?"Informations sur la boutique":"Store information"}>
   {openStatus&&<span className={"foonActivityOpenStatus"+(openStatus==="open"?" is-open":"")}>{openStatus==="open"?(language==="ar"?"مفتوح الآن":language==="fr"?"Ouvert":"Open now"):(language==="ar"?"مغلق الآن":language==="fr"?"Fermé":"Closed")}</span>}
   {typeof branding.address==="string"&&branding.address&&<span><b aria-hidden="true">⌖</b>{branding.address}</span>}
   {phone&&<a href={"tel:"+phone} dir="ltr"><b aria-hidden="true">☎</b>{phone}</a>}
  </section>
  <section className="foonActivityContent" aria-label={service?t.services:t.browse}>
   <h2 style={{fontSize:24}}>{service?t.services:t.browse}</h2>
   <form action={base} method="get" className="foonActivitySearch"><input name="q" defaultValue={search} maxLength={100} aria-label={language==="ar"?"بحث المنتجات والخدمات":language==="fr"?"Rechercher des produits et services":"Search products and services"} placeholder={language==="ar"?"ابحث عن منتج أو خدمة":language==="fr"?"Rechercher":"Search products or services"}/>{selectedCategory&&<input type="hidden" name="category" value={selectedCategory}/>}<button type="submit">{language==="ar"?"بحث":language==="fr"?"Rechercher":"Search"}</button></form>
   <div className="foonActivityCatalog"><aside id="activity-categories" className="foonActivityCategoryRail"><span className="foonActivityRailHeading">{language==="ar"?"الأقسام":language==="fr"?"Catégories":"Categories"}</span><nav className="foonActivityCategories" aria-label={language==="ar"?"أقسام النشاط":language==="fr"?"Catégories":"Categories"}><Link aria-current={!selectedCategory?"page":undefined} href={url("",1)}>{language==="ar"?"الكل":language==="fr"?"Tout":"All"}</Link>{categories.map(c=><Link key={c.id} aria-current={selectedCategory===c.id?"page":undefined} href={url(c.id,1)}>{c.imageUrl&&<img src={c.imageUrl} alt="" width={36} height={36} style={{objectFit:"cover",borderRadius:8}}/>}{categoryName(c)}</Link>)}</nav></aside><div className="foonActivityCatalogProducts" id="activity-products">
   {selectedCategory&&categories.find(c=>c.id===selectedCategory)?.description&&<p style={{whiteSpace:"pre-wrap"}}>{categories.find(c=>c.id===selectedCategory)?.description}</p>}<p className="foonActivityCount">{language==="ar"?"عدد النتائج":language==="fr"?"Résultats":"Results"}: {total.toLocaleString("en-US")}</p>
   {catalogError?<div className="foonActivityEmpty" role="alert"><span aria-hidden="true">⚠</span><p>{language==="ar"?"تعذر تحميل المنتجات حاليًا. يرجى المحاولة لاحقًا.":language==="fr"?"Impossible de charger le catalogue. Réessayez plus tard.":"Unable to load the catalog. Please try again later."}</p></div>:products.length?<div className="foonActivityProducts">{products.map(product=><article className="foonActivityProduct" key={product.id}><ActivityProductDetails slug={slug} id={product.id} name={language==="en"?product.nameEn||product.name:language==="fr"?product.nameFr||product.name:product.name} description={product.description} imageUrl={product.imageUrl} price={product.price} currency={product.currency} unit={product.measured?product.unit:undefined} language={language} canAdd={cart} service={serviceCart}/><div className="foonActivityProductInfo"><h3>{language==="en"?product.nameEn||product.name:language==="fr"?product.nameFr||product.name:product.name}</h3><small>{localizedCategory(product.category)}</small>{service&&<small className="foonActivityServiceTag">{product.productType==="physical"?(language==="ar"?"منتج":language==="en"?"Product":"Produit"):(language==="ar"?"خدمة":language==="en"?"Service":"Service")}</small>}{product.description&&<p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{product.description}</p>}<div className="foonActivityProductPurchase"><strong dir="ltr">{product.price.toFixed(2)} {product.currency}{product.measured?" / "+product.unit:""}</strong>{cart&&<StorefrontAddButton slug={slug} id={product.id} language={language} service={serviceCart}/>}</div>{branding.vatEnabled==="yes"&&<small>{branding.menuStoredPricesIncludeVat==="yes"?(language==="ar"?"شامل الضريبة":language==="en"?"Tax included":"Taxe comprise"):(language==="ar"?"السعر قبل الضريبة":language==="en"?"Price before tax":"Prix hors taxe")}</small>}
 {service&&controls.serviceRequests&&product.productType==="service"&&requestMode&&<ServiceRequestAction key={product.id+":"+requestMode} slug={slug} serviceId={product.id} serviceName={language==="en"?product.nameEn||product.name:language==="fr"?product.nameFr||product.name:product.name} mode={requestMode} language={language} signedIn={signedIn} linked={linked} defaultPhone={customerPhone}/>}
 {service&&!serviceCart&&phone&&<a className="foonActivityServicePhone" href={"tel:"+phone}>{contactLabel}</a>}</div></article>)}</div>:<div className="foonActivityEmpty"><span aria-hidden="true">{service?"◷":"▦"}</span><p>{t.coming}</p></div>}
   {pages>1&&<nav className="foonActivityPagination" aria-label={language==="ar"?"صفحات المنتجات":language==="fr"?"Pages des produits":"Product pages"}>{visiblePage>1&&<Link href={url(selectedCategory,visiblePage-1)}>{language==="ar"?"السابق":language==="fr"?"Précédent":"Previous"}</Link>}<span>{visiblePage.toLocaleString("en-US")} / {pages.toLocaleString("en-US")}</span>{visiblePage<pages&&<Link href={url(selectedCategory,visiblePage+1)}>{language==="ar"?"التالي":language==="fr"?"Suivant":"Next"}</Link>}</nav>}
   </div>{cart&&<aside className="foonActivityCartRail" id="activity-cart"><StorefrontCart controls={controls} checkoutPolicy={checkoutPolicy(branding)} key={slug} slug={slug} language={language} signedIn={signedIn} linked={linked} customerPhone={customerPhone} deliveryAddress={deliveryAddress} service={serviceCart}/></aside>}</div>
  </section>
  {service&&controls.serviceRequests&&requestMode&&<ServiceRequestHistory slug={slug} language={language} visible={signedIn}/>}
  <StorefrontInfo slug={slug} branding={branding} language={language} controls={controls}/>
  <footer className="foonActivityFooter">{branding.platformBranding!=="hidden"&&<Link href="/">FOON</Link>}</footer>
  <nav className="foonActivityMobileDock" aria-label={language==="ar"?"التنقل في المتجر":language==="fr"?"Navigation de la boutique":"Store navigation"}><a href="#activity-products"><span aria-hidden="true">⌂</span><span>{service?t.services:t.browse}</span></a><a href="#activity-categories"><span aria-hidden="true">☷</span><span>{language==="ar"?"الأقسام":language==="fr"?"Catégories":"Categories"}</span></a>{cart&&<a href="#activity-cart"><span aria-hidden="true">🛒</span><span>{language==="ar"?"السلة":language==="fr"?"Panier":"Cart"}</span></a>}{(signedIn||controls.customerLogin)&&<Link href={signedIn?"/customer":"/"+encodeURIComponent(slug)+"/login"}><span aria-hidden="true">◯</span><span>{t.account}</span></Link>}</nav>
 </main>;
}
