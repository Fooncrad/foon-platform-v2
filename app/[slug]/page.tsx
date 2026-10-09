import {notFound} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import Link from "next/link";

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
 return <main className="publicTenant publicTenantProfile" dir="rtl">
  <header className="publicTenantTop"><Link href="/" aria-label="FOON الرئيسية">FOON</Link><nav><Link href="/market">استكشف السوق</Link><Link href="/login">تسجيل الدخول</Link></nav></header>
  <section className="publicTenantHero">
   <span>{isRestaurant?"مطعم على منصة FOON":"نشاط على منصة FOON"}</span>
   <h1>{String(tenant.name)}</h1>
   <p>{isRestaurant?"مرحبًا بك في صفحة المطعم. اكتشف نشاطنا وتابع الخدمات المتاحة.":"مرحبًا بك في صفحة المتجر. اكتشف نشاطنا وتابع الخدمات المتاحة."}</p>
   <div className="publicTenantActions"><Link href={`/${slug}/register`}>إنشاء حساب عميل</Link><Link href="/market">العودة إلى السوق</Link></div>
  </section>
  <section className="publicTenantDetails"><article><span>نوع النشاط</span><strong>{isRestaurant?"مطعم":"متجر أو نشاط خدمي"}</strong></article><article><span>حالة النشاط</span><strong>متاح على المنصة</strong></article><article><span>حساب العملاء</span><strong>التسجيل من خلال هذا النشاط</strong></article></section>
  <footer className="publicTenantFooter"><span>FOON PLATFORM</span><Link href="/market">تصفح أنشطة أخرى</Link></footer>
 </main>;
}
