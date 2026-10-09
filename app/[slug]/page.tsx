import {notFound} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import Link from "next/link";
import RestaurantMenuClient from "./restaurant-menu-client";

import {validStoreSlug} from "@/scripts/store-slug.mjs";

export async function generateMetadata({params}:{params:Promise<{slug:string}>}){
 const {slug:raw}=await params;
 const slug=raw.toLowerCase();
 if(!validStoreSlug(slug))return {title:"النشاط غير موجود | FOON",robots:{index:false,follow:false}};
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT name,kind,status FROM tenants WHERE slug=? LIMIT 1",[slug]);
  const tenant=rows[0];
  if(!tenant||tenant.status!=="active")return {title:"النشاط غير موجود | FOON",robots:{index:false,follow:false}};
  const name=String(tenant.name);
  return {title:name+" | FOON",description:(tenant.kind==="restaurant"?"اكتشف مطعم ":"اكتشف متجر ")+name+" على منصة FOON.",alternates:{canonical:"/"+encodeURIComponent(slug)}};
 }catch{return {title:"FOON",robots:{index:false,follow:false}}}
}

export default async function PublicTenantPage({params}:{params:Promise<{slug:string}>}){
 const {slug:raw}=await params;
 const slug=raw.toLowerCase();
 if(!validStoreSlug(slug))notFound();
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT id,name,slug,kind,status FROM tenants WHERE slug=? LIMIT 1",[slug]
 );
 const tenant=rows[0];
 if(!tenant||tenant.status!=="active")notFound();
 const isRestaurant=String(tenant.kind)==="restaurant";
 let menuTemplate="sufra";
 if(isRestaurant){try{
 const [appearance]=await database().execute<RowDataPacket[]>("SELECT template_key FROM restaurant_menu_appearance WHERE tenant_id=? LIMIT 1",[String(tenant.id)]);
 if(["classic","modern","minimal","sufra"].includes(String(appearance[0]?.template_key)))menuTemplate=String(appearance[0].template_key);
 }catch{/* Template migration not yet applied: use safe default. */}}
 let menuCategories:RowDataPacket[]=[];let menuItems:RowDataPacket[]=[];let menuUnavailable=false;
 if(isRestaurant){try{
 const [categories]=await database().execute<RowDataPacket[]>("SELECT id,name FROM restaurant_menu_categories WHERE tenant_id=? AND enabled=1 ORDER BY sort_order,name LIMIT 100",[String(tenant.id)]);
 menuCategories=categories;
 const [items]=await database().execute<RowDataPacket[]>("SELECT i.id,i.category_id,i.name,i.description,i.price,i.currency FROM restaurant_menu_items i JOIN restaurant_menu_categories c ON c.id=i.category_id AND c.tenant_id=i.tenant_id WHERE i.tenant_id=? AND i.enabled=1 AND c.enabled=1 ORDER BY i.sort_order,i.name LIMIT 500",[String(tenant.id)]);
 menuItems=items;
 }catch{menuUnavailable=true}}

 if(isRestaurant){
  return <main className="foonCleanMenu" dir="rtl">
   <header className="foonCleanMenuHeader">
    <details className="foonCleanMenuNav"><summary aria-label="فتح القائمة"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></summary><nav><Link href={`/${slug}/login`}>حسابي · دخول العملاء</Link><Link href={`/${slug}/register`}>تسجيل عميل</Link></nav></details>
    <Link className="foonCleanMenuBrand" href={`/${slug}`}>{String(tenant.name)}</Link>
    <div className="foonCleanMenuTools">
     <details className="foonCleanMenuLang"><summary aria-label="اللغات"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/></svg></summary><div>العربية · English · Français</div></details>
     <span className="foonCleanMenuCart" aria-label="السلة غير مفعلة بعد"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M2 3h2l3 12h12l2-9H5"/></svg><span>0</span></span>
     <Link className="foonCleanMenuAccount" href={`/${slug}/login`} aria-label="حساب العميل"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M6.5 19c.7-3.2 3-4.5 5.5-4.5s4.8 1.3 5.5 4.5"/></svg></Link>
    </div>
   </header>
  </main>;
 }
 return <main className={isRestaurant?`publicTenant publicTenantProfile foonRestaurantPage foonTheme-${menuTemplate}`:"publicTenant publicTenantProfile"} dir="rtl">
  <header className="publicTenantTop"><Link href={`/${slug}`} aria-label="صفحة المتجر">{String(tenant.name)}</Link><nav><Link href={`/${slug}/login`}>حسابي · دخول العملاء</Link><Link href={`/${slug}/register`}>تسجيل عميل</Link></nav></header>
  <section className="publicTenantHero">
   <span>{isRestaurant?"مطعم على منصة FOON":"نشاط على منصة FOON"}</span>
   <h1>{String(tenant.name)}</h1>
   <p>{isRestaurant?"مرحبًا بك في صفحة المطعم. اكتشف نشاطنا وتابع الخدمات المتاحة.":"مرحبًا بك في صفحة المتجر. اكتشف نشاطنا وتابع الخدمات المتاحة."}</p>
   <div className="publicTenantActions">{isRestaurant&&<a href="#restaurant-menu">استعرض المنيو</a>}<Link href={`/${slug}/register`}>إنشاء حساب عميل</Link><Link href={`/${slug}/login`}>حسابي · دخول العملاء</Link></div>
  </section>
  {isRestaurant&&<section id="restaurant-menu" className="foonRestaurantMenu" aria-labelledby="restaurant-menu-title"><div className="foonRestaurantMenuHeading"><span>MENU · FOON</span><h2 id="restaurant-menu-title">المنيو</h2><p>استعرض الأقسام والأصناف المتاحة في المطعم.</p></div>{menuUnavailable?<div className="foonRestaurantMenuEmpty" role="alert">تعذر تحميل المنيو. حاول لاحقًا.</div>:menuCategories.length===0?<div className="foonRestaurantMenuEmpty" role="status"><strong>المنيو قيد التجهيز</strong><p>لم تُنشر أقسام بعد.</p></div>:<RestaurantMenuClient categories={menuCategories.map(c=>({id:String(c.id),name:String(c.name)}))} items={menuItems.map(i=>({id:String(i.id),category_id:String(i.category_id),name:String(i.name),description:i.description?String(i.description):null,price:Number(i.price),currency:String(i.currency)}))}/>}</section>}
  {!isRestaurant&&<section className="publicTenantDetails"><article><span>نوع النشاط</span><strong>{isRestaurant?"مطعم":"متجر أو نشاط خدمي"}</strong></article><article><span>حالة النشاط</span><strong>متاح على المنصة</strong></article><article><span>حساب العملاء</span><strong>التسجيل من خلال هذا النشاط</strong></article></section>}
  <footer className="publicTenantFooter"><span>FOON PLATFORM</span><Link href={`/${slug}/login`}>دخول العملاء</Link></footer>
 </main>;
}
