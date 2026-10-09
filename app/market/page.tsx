import Link from "next/link";
import {cookies,headers} from "next/headers";
import {supportedCountries} from "@/lib/tenant/country-catalog";
import CountryPicker from "./country-picker";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
type Store=RowDataPacket&{slug:string;name:string;kind:"restaurant"|"store"};
export const dynamic="force-dynamic";
export default async function MarketPage({searchParams}:{searchParams:Promise<{q?:string;kind?:string;country?:string}>}){
 const params=await searchParams;const q=String(params.q??"").trim().slice(0,80);
 const codes=new Set<string>(supportedCountries.map(c=>c.code));
 const saved=(await cookies()).get("foon-market-country")?.value??"";
 const h=await headers();const geo=(h.get("cf-ipcountry")??h.get("x-vercel-ip-country")??"").toUpperCase();
 const requested=String(params.country??"").toUpperCase();
 const country=codes.has(requested)?requested:codes.has(saved)?saved:codes.has(geo)?geo:"";
 const kind=params.kind==="restaurant"||params.kind==="store"?params.kind:"";
 const where=["bp.country_code=?","t.status='active'"];const args:string[]=[country];
 if(kind){where.push("t.kind=?");args.push(kind)}
 if(q){where.push("(t.name LIKE ? OR t.slug LIKE ?)");args.push("%"+q+"%","%"+q+"%")}
 let stores:Store[]=[];let error=false;
 try{if(country){const [rows]=await database().execute<Store[]>("SELECT t.slug,t.name,t.kind FROM tenants t JOIN tenant_business_profiles bp ON bp.tenant_id=t.id WHERE "+where.join(" AND ")+" ORDER BY t.created_at DESC LIMIT 100",args);stores=rows}}catch{error=true}
 return <main className="foonMarket" dir="rtl"><header className="foonMarketHeader"><Link href="/" className="foonMarketBrand">FOON</Link><nav><Link href="/">الرئيسية</Link><Link href="/login">دخول</Link><Link href="/register">أضف نشاطك مجانًا</Link></nav></header><section className="foonMarketHero"><span>FOON MARKETPLACE</span><h1>اكتشف المتاجر والمطاعم</h1><p>استكشف الأنشطة المتاحة على منصة FOON، وانتقل مباشرة إلى صفحة النشاط.</p><CountryPicker selected={country}/>{!country&&<p role="status">اختر دولتك لعرض المتاجر المحلية فقط.</p>}<form method="get" action="/market" className="foonMarketSearch"><input type="hidden" name="country" value={country}/><label>ابحث عن نشاط<input name="q" type="search" maxLength={80} defaultValue={q} placeholder="اسم المتجر أو المطعم"/></label><label>نوع النشاط<select name="kind" defaultValue={kind}><option value="">جميع الأنشطة</option><option value="restaurant">مطاعم</option><option value="store">متاجر</option></select></label><button type="submit">بحث</button></form></section><section className="foonMarketResults"><h2>الأنشطة المتاحة {country?"في "+(supportedCountries.find(c=>c.code===country)?.ar??country):""}</h2>{error?<p role="alert">تعذر تحميل السوق الآن. حاول مرة أخرى لاحقًا.</p>:stores.length===0?<p>لا توجد أنشطة مطابقة للبحث حاليًا.</p>:<div className="foonMarketGrid">{stores.map(store=><Link key={store.slug} href={`/${encodeURIComponent(store.slug)}`} className="foonMarketCard"><span className="foonMarketCardIcon" aria-hidden="true">{store.kind==="restaurant"?"♨":"▣"}</span><div><span className="foonMarketType">{store.kind==="restaurant"?"مطعم":"متجر"}</span><h3>{store.name}</h3><span className="foonMarketVisit">زيارة النشاط ←</span></div></Link>)}</div>}</section></main>
}
