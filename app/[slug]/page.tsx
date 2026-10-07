import {notFound} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";

const RESERVED=new Set(["admin","api","login","register","account","dashboard","restaurant","menu","auth","settings","creator","creators","help","about","contact","terms","privacy","favicon.ico"]);

function validSlug(value:string){
 return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)&&!RESERVED.has(value);
}

export default async function PublicTenantPage({params}:{params:Promise<{slug:string}>}){
 const {slug:raw}=await params;
 const slug=raw.toLowerCase();
 if(!validSlug(slug))notFound();
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
  </section>
 </main>;
}
