import {publicStorefrontUrl} from "@/lib/tenant/workspace-routes";
import {cookies as uiCookies} from "next/headers";
import {uiText} from "@/lib/i18n/ui-copy";
import Link from "next/link";
import {cookies,headers} from "next/headers";
import {supportedCountries} from "@/lib/tenant/country-catalog";
import {registrationActivities} from "@/lib/tenant/registration-activities";
import {MARKET_PAGE_SIZE,buildMarketWhere,marketListingOrderSql,marketPageCount,marketPageUrl,parseMarketFilters} from "@/lib/market/search";
import CountryPicker from "./country-picker";
import {PublicMarketShell,PublicSiteHeader,PublicSiteFooter} from "@/app/public-site-chrome";
import {publicFooterPages} from "@/lib/platform/public-footer-pages";
import "./country-picker.css";
import "./market-layout.css";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
type Store=RowDataPacket&{id:string;slug:string;name:string;kind:"restaurant"|"store";activity_code:string};
export const dynamic="force-dynamic";
export default async function MarketPage({searchParams}:{searchParams:Promise<{q?:string;kind?:string;activity?:string;country?:string;page?:string}>}){
 const translationLanguage=(await uiCookies()).get("foon_language")?.value;
 const language=translationLanguage==="en"||translationLanguage==="fr"?translationLanguage:"ar";
 const translateUi=(value:string)=>uiText(value,language);
 const params=await searchParams;
 const saved=(await cookies()).get("foon-market-country")?.value??"";
 const h=await headers(),geo=(h.get("cf-ipcountry")??h.get("x-vercel-ip-country")??"").toUpperCase();
 const requested=parseMarketFilters({country:params.country});
 const fallback=parseMarketFilters({country:saved||geo||"SA"});
 const filters=parseMarketFilters({...params,country:requested.country||fallback.country});
 const {where,args}=buildMarketWhere(filters);
 let stores:Store[]=[],total=0,page=filters.page,error=false;
 try{
  if(filters.country){
   const db=database();
   const [counts]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM tenants t JOIN tenant_business_profiles bp ON bp.tenant_id=t.id WHERE "+where,args);
   total=Number(counts[0]?.total??0);
   page=Math.min(filters.page,marketPageCount(total));
   const [rows]=await db.execute<Store[]>(
    "SELECT t.id,t.slug,t.name,t.kind,bp.activity_code FROM tenants t JOIN tenant_business_profiles bp ON bp.tenant_id=t.id WHERE "+
    where+" ORDER BY "+marketListingOrderSql()+" LIMIT ? OFFSET ?",
    [...args,MARKET_PAGE_SIZE,(page-1)*MARKET_PAGE_SIZE]
   );
   stores=rows;
  }
 }catch{error=true;}
 const chosen=supportedCountries.find(c=>c.code===filters.country);
 const chosenName=chosen?(chosen[language]??chosen.ar):"";
 const pages=marketPageCount(total);
 const footerPages=await publicFooterPages();
 const label=(code:string)=>{
  const activity=registrationActivities.find(a=>a.id===code);
  return activity?.[language]??activity?.ar??translateUi("متجر");
 };
 return <PublicMarketShell><PublicSiteHeader/><main className="foonMarket" dir={language==="ar"?"rtl":"ltr"}>
  <section className="foonMarketHero">
   <span>FOON MARKETPLACE</span><h1>{translateUi("اكتشف المتاجر والمطاعم")}</h1>
   <p>{translateUi("استكشف الأنشطة المتاحة على منصة FOON، وانتقل مباشرة إلى صفحة النشاط.")}</p>
   <CountryPicker selected={filters.country}/>
   {!filters.country&&<p role="status">{translateUi("اختر دولتك لعرض المتاجر المحلية فقط.")}</p>}
   <form method="get" action="/market" className="foonMarketSearch">
    <input type="hidden" name="country" value={filters.country}/>
    <label>{translateUi("ابحث عن نشاط")}<input name="q" type="search" maxLength={80} defaultValue={filters.q} placeholder={translateUi("اسم المتجر أو المطعم")}/></label>
    <label>{translateUi("نوع النشاط")}<select name="kind" defaultValue={filters.kind}>
      <option value="">{translateUi("جميع الأنشطة")}</option>
      <option value="restaurant">{translateUi("مطاعم")}</option>
      <option value="store">{translateUi("متاجر")}</option>
    </select></label>
    <label>{translateUi("تخصص النشاط")}<select name="activity" defaultValue={filters.activity}>
      <option value="">{translateUi("كل التخصصات")}</option>
      {registrationActivities.map(a=><option key={a.id} value={a.id}>{a[language]}</option>)}
    </select></label>
    <button type="submit">{translateUi("بحث")}</button>
   </form>
  </section>
  <section className="foonMarketResults">
   <h2>{translateUi("الأنشطة المتاحة")} {chosenName?language==="en"?"in "+chosenName:language==="fr"?"en "+chosenName:"في "+chosenName:""}</h2>
   {error?<p role="alert">{translateUi("تعذر تحميل السوق الآن. حاول مرة أخرى لاحقًا.")}</p>:!filters.country?<p>{translateUi("اختر دولتك لعرض المتاجر المحلية فقط.")}</p>:stores.length===0?<p>{translateUi("لا توجد أنشطة مطابقة للبحث حاليًا.")}</p>:
   <><p role="status">{language==="ar"?"النتائج":language==="en"?"Results":"Résultats"}: {total.toLocaleString("en")} · {language==="ar"?"صفحة":language==="en"?"Page":"Page"} {page.toLocaleString("en")} / {pages.toLocaleString("en")}</p>
   <div className="foonMarketGrid">{stores.map(store=><Link key={store.id} href={publicStorefrontUrl(String(store.slug))} className="foonMarketCard">
    <span className="foonMarketCardIcon" aria-hidden="true">{({restaurant:"🍽️",cafe:"☕",sweets:"🍰",grocery:"🛒",clothing:"👗",perfume:"🧴",accessories:"💍",watches:"⌚",gifts:"🎁",ecommerce:"🛍️",carwash:"🚗",automotive:"🔧",laundry:"🧺",salon:"✂️",publicworks:"🏗️"} as Record<string,string>)[store.activity_code]??"🏬"}</span>
    <div><span className="foonMarketType">{label(store.activity_code)}</span><h3>{store.name}</h3><span className="foonMarketVisit">{store.kind==="restaurant"?translateUi("عرض المنيو"):translateUi("تصفح المنتجات والخدمات")} <span aria-hidden="true">←</span></span></div>
   </Link>)}</div>
   {pages>1&&<nav className="foonMarketPagination" aria-label={translateUi("صفحات النتائج")}>
    {page>1&&<Link href={marketPageUrl(filters,page-1)}>{translateUi("السابق")}</Link>}
    <span>{page.toLocaleString("en")} / {pages.toLocaleString("en")}</span>
    {page<pages&&<Link href={marketPageUrl(filters,page+1)}>{translateUi("التالي")}</Link>}
   </nav>}</>}
  </section>
 </main><PublicSiteFooter pages={footerPages}/></PublicMarketShell>;
}
