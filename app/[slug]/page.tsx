import {notFound} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import Link from "next/link";

import {validStoreSlug} from "@/scripts/store-slug.mjs";

export default async function PublicTenantPage({params}:{params:Promise<{slug:string}>}){
 const {slug:raw}=await params;
 const slug=raw.toLowerCase();
 if(!validStoreSlug(slug))notFound();
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT id,name,slug,kind,status FROM tenants WHERE slug=? LIMIT 1",[slug]
 );
 const tenant=rows[0];
 if(!tenant||tenant.status!=="active")notFound();
 return <main className="publicTenant">
  <section className="publicTenantHero">
   <span>FOON</span>
   <h1>{String(tenant.name)}</h1>
   <p>{String(tenant.kind||"business")}</p>
   <Link href={`/${slug}/register`}>إنشاء حساب عميل</Link>
  </section>
 </main>;
}
