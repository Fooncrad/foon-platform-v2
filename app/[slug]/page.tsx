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
