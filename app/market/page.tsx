import {MarketFavorite,MarketNearby,MarketOffers} from "./market-card-actions";
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
type MarketMedia={cover:string;city:string;branches:{id:string;name:string;latitude:number|null;longitude:number|null}[]};
const validCover=(value:unknown)=>typeof value==="string"&&(value.startsWith("/")&&!value.startsWith("//")||/^https:\/\//i.test(value))&&!/[<>"\s]/.test(value)&&value.length<2048;
const parseJson=(value:unknown)=>{try{return typeof value==="string"?JSON.parse(value):value}catch{return null}};
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
 const media=new Map<string,MarketMedia>();
 const suggestions:string[]=[];
 const ids=stores.map(s=>String(s.id));
 if(ids.length){
  const inList=ids.map(()=>"?").join(",");
  for(const id of ids)media.set(id,{cover:"",city:"",branches:[]});
  try{
   const [brands]=await database().execute<RowDataPacket[]>("SELECT tenant_id,data FROM restaurant_resources WHERE kind='storefront_config' AND archived=FALSE AND status='active' AND tenant_id IN ("+inList+")",[...ids]);
   for(const brand of brands){const entry=media.get(String(brand.tenant_id));const payload=parseJson(brand.data);if(entry&&payload&&typeof payload==="object"&&validCover(payload.coverUrl))entry.cover=payload.coverUrl;}
  }catch{/* Existing optional storefront resources: fallback art remains visible */}
  try{
   const [branches]=await database().execute<RowDataPacket[]>("SELECT * FROM branches WHERE enabled=TRUE AND tenant_id IN ("+inList+") ORDER BY created_at LIMIT 150",[...ids]);
   for(const row of branches){const entry=media.get(String(row.tenant_id));if(!entry)continue;const city=typeof row.city==="string"?row.city.trim():"";if(city&&!entry.city)entry.city=city;const lat=Number(row.latitude),lng=Number(row.longitude);entry.branches.push({id:String(row.id),name:String(row.name??city),latitude:row.latitude!=null&&Number.isFinite(lat)&&lat>=-90&&lat<=90?lat:null,longitude:row.longitude!=null&&Number.isFinite(lng)&&lng>=-180&&lng<=180?lng:null});}
  }catch{/* Older installations may not expose city or coordinates */}
 }
 if(filters.country){
  try{const [hints]=await database().execute<RowDataPacket[]>("SELECT t.name AS name FROM tenants t JOIN tenant_business_profiles bp ON bp.tenant_id=t.id WHERE bp.country_code=? AND t.status='active' AND t.market_enabled=TRUE AND (t.market_visible_from IS NULL OR t.market_visible_from<=UTC_TIMESTAMP()) AND (t.market_visible_until IS NULL OR t.market_visible_until>UTC_TIMESTAMP()) AND t.name LIKE ? ORDER BY t.market_sort_order,t.name LIMIT 8",[filters.country,"%"+filters.q.replace(/[!%_]/g,k=>"!"+k)+"%"]);for(const row of hints)suggestions.push(String(row.name));}catch{}
 }
 const chosen=supportedCountries.find(c=>c.code===filters.country);
 const chosenName=chosen?(chosen[language]??chosen.ar):"";
 const pages=marketPageCount(total);
 const footerPages=await publicFooterPages();
 const l={ar:{hero:"اكتشف المتاجر والمطاعم",intro:"تسوّق من الأنشطة المحلية على منصة FOON",search:"ابحث عن مطعم أو متجر",searchBtn:"بحث",results:"الأنشطة المتاحة",browse:"تصفح المتجر",menu:"عرض المنيو",services:"عرض المنتجات والخدمات",all:"الكل",restaurants:"مطاعم",shops:"متاجر",coffee:"قهوة",sweets:"حلويات",kind:"نوع النشاط",specialty:"التخصص",allKinds:"جميع الأنشطة",allSpecialties:"كل التخصصات",trust:"أنشطة منشورة في السوق",local:"دعم الأنشطة المحلية",choice:"تصفح ما يناسبك",error:"تعذر تحميل السوق حاليًا",empty:"لا توجد أنشطة مطابقة حاليًا؛ جرّب تغيير البحث أو الدولة",select:"اختر الدولة لعرض الأنشطة",count:"نتيجة",page:"صفحة",previous:"السابق",next:"التالي"},en:{hero:"Discover local stores and restaurants",intro:"Explore businesses available on FOON",search:"Search restaurants and stores",searchBtn:"Search",results:"Available businesses",browse:"Browse store",menu:"View menu",services:"Browse products and services",all:"All",restaurants:"Restaurants",shops:"Stores",coffee:"Coffee",sweets:"Sweets",kind:"Business type",specialty:"Specialty",allKinds:"All businesses",allSpecialties:"All specialties",trust:"Businesses listed on FOON",local:"Support local businesses",choice:"Find what suits you",error:"Marketplace is temporarily unavailable",empty:"No matching businesses; try another search or country",select:"Choose a country to browse",count:"results",page:"Page",previous:"Previous",next:"Next"},fr:{hero:"Découvrez les boutiques et restaurants",intro:"Explorez les commerces disponibles sur FOON",search:"Rechercher un restaurant ou une boutique",searchBtn:"Rechercher",results:"Établissements disponibles",browse:"Voir la boutique",menu:"Voir le menu",services:"Voir les produits et services",all:"Tous",restaurants:"Restaurants",shops:"Boutiques",coffee:"Cafés",sweets:"Pâtisseries",kind:"Type d’activité",specialty:"Spécialité",allKinds:"Toutes les activités",allSpecialties:"Toutes les spécialités",trust:"Commerces présents sur FOON",local:"Soutenir les commerces locaux",choice:"Explorez à votre rythme",error:"Le marché est temporairement indisponible",empty:"Aucun commerce correspondant. Modifiez les filtres",select:"Choisissez un pays",count:"résultats",page:"Page",previous:"Précédent",next:"Suivant"}}[language];
 const label=(code:string)=>{
  const activity=registrationActivities.find(a=>a.id===code);
  return activity?.[language]??activity?.ar??translateUi("متجر");
 };
 const activityIcons:Record<string,string>={restaurant:"🍽️",cafe:"☕",sweets:"🧁",grocery:"🛒",clothing:"👗",perfume:"🧴",accessories:"💍",watches:"⌚",gifts:"🎁",ecommerce:"🛍️",carwash:"🚗",automotive:"🔧",laundry:"🧺",salon:"✂️",publicworks:"🏗️"};
 const categories=[{id:"",kind:"",activity:"",name:l.all,icon:"▦"},{id:"restaurant",kind:"restaurant",activity:"",name:l.restaurants,icon:"🍽️"},{id:"cafe",kind:"",activity:"cafe",name:l.coffee,icon:"☕"},{id:"sweets",kind:"",activity:"sweets",name:l.sweets,icon:"🧁"},{id:"store",kind:"store",activity:"",name:l.shops,icon:"🛍️"}];
 const categoryUrl=(kind:string,activity:string)=>marketPageUrl({...filters,kind:kind as typeof filters.kind,activity,page:1},1);
 const categoryActive=(kind:string,activity:string)=>filters.kind===kind&&filters.activity===activity;
 return <PublicMarketShell><PublicSiteHeader/><main className="foonMarket" dir={language==="ar"?"rtl":"ltr"}>
 <section className="foonMarketHero">
  <div className="foonMarketHeroContent"><span className="foonMarketEyebrow">FOON MARKETPLACE</span><h1>{l.hero}</h1><p>{l.intro}</p>
   <div className="foonMarketCountry"><CountryPicker selected={filters.country}/></div>
   <form method="get" action="/market" className="foonMarketSearch">
    <input type="hidden" name="country" value={filters.country}/>
    <input type="hidden" name="kind" value={filters.kind}/>
    <input type="hidden" name="activity" value={filters.activity}/>
    <label className="foonMarketSearchInput"><span className="foonSearchIcon" aria-hidden="true">⌕</span><span className="sr-only">{l.search}</span><input name="q" type="search" list="foon-market-search-hints" maxLength={80} defaultValue={filters.q} placeholder={l.search}/><datalist id="foon-market-search-hints">{suggestions.map(name=><option key={name} value={name}/>)}</datalist></label>
    <button type="submit">{l.searchBtn}</button>
   </form>
   <div className="foonMarketTrust"><span>◇ {l.trust}</span><span>♡ {l.local}</span><span>✦ {l.choice}</span></div>
  </div><div className="foonMarketHeroArt" aria-hidden="true"><span>FOON</span><strong>☕</strong><i>✦</i></div>
 </section>
 <section className="foonMarketResults">
  <MarketNearby branches={[...media.values()].flatMap(m=>m.branches)} language={language}/><header className="foonMarketResultsHead"><div><h2>⌖ {l.results}{chosenName?" · "+chosenName:""}</h2><p>{total.toLocaleString("en")} {l.count}</p></div></header>
  <nav className="foonMarketCategories" aria-label={l.kind}>{categories.map(c=><Link key={c.id} href={categoryUrl(c.kind,c.activity)} className={categoryActive(c.kind,c.activity)?"active":""} aria-current={categoryActive(c.kind,c.activity)?"page":undefined}><span aria-hidden="true">{c.icon}</span> {c.name}</Link>)}</nav>
  <form method="get" action="/market" className="foonMarketFilters">
   <input type="hidden" name="country" value={filters.country}/><input type="hidden" name="q" value={filters.q}/>
   <label><span className="sr-only">{l.kind}</span><select name="kind" defaultValue={filters.kind}><option value="">{l.allKinds}</option><option value="restaurant">{l.restaurants}</option><option value="store">{l.shops}</option></select></label>
   <label><span className="sr-only">{l.specialty}</span><select name="activity" defaultValue={filters.activity}><option value="">{l.allSpecialties}</option>{registrationActivities.map(a=><option value={a.id} key={a.id}>{a[language]}</option>)}</select></label>
   <button type="submit">{l.searchBtn}</button>
  </form>
  {error?<p role="alert" className="foonMarketEmpty">{l.error}</p>:!filters.country?<p className="foonMarketEmpty">{l.select}</p>:stores.length===0?<p className="foonMarketEmpty">{l.empty}</p>:
  <><div className="foonMarketGrid">{stores.map(store=><article key={store.id} className="foonMarketCard">
   <div className="foonMarketCardCover" data-activity={store.activity_code}>{media.get(String(store.id))?.cover&&<img className="foonMarketRealCover" src={media.get(String(store.id))!.cover} alt="" loading="lazy" referrerPolicy="no-referrer"/>}<MarketFavorite tenantId={String(store.id)} language={language}/><span className="foonMarketCoverMark" aria-hidden="true">{activityIcons[store.activity_code]??"🏬"}</span><span className="foonMarketCoverBrand" aria-hidden="true">FOON</span></div>
   <div className="foonMarketCardBody"><div className="foonMarketCardTop"><span className="foonMarketCardIcon" aria-hidden="true">{activityIcons[store.activity_code]??"🏬"}</span><div><h3>{store.name}</h3><p>{label(store.activity_code)}{media.get(String(store.id))?.city?" · "+media.get(String(store.id))!.city:""}</p></div></div>
    <p className="foonMarketCardDescription">{language==="ar"?"استكشف المنتجات والخدمات التي يقدمها هذا النشاط.":language==="en"?"Explore this business’s products and services.":"Découvrez les produits et services de cet établissement."}</p>
    <MarketOffers tenantId={String(store.id)} language={language}/><Link href={publicStorefrontUrl(String(store.slug))} className="foonMarketVisit">{store.kind==="restaurant"?l.menu:store.kind==="store"?l.services:l.browse} <span aria-hidden="true">←</span></Link></div>
  </article>)}</div>
  {pages>1&&<nav className="foonMarketPagination" aria-label={translateUi("صفحات النتائج")}>{page>1&&<Link href={marketPageUrl(filters,page-1)}>{l.previous}</Link>}<span>{l.page} {page.toLocaleString("en")} / {pages.toLocaleString("en")}</span>{page<pages&&<Link href={marketPageUrl(filters,page+1)}>{l.next}</Link>}</nav>}</>}
 </section></main><PublicSiteFooter pages={footerPages}/></PublicMarketShell>;
}
