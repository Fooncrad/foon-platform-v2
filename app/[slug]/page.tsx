import {notFound} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {parseData} from "@/lib/restaurant/operations";
import PublicMenu from "./public-menu";
import "./public-menu.css";

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
 const [[resources],[branches]]=await Promise.all([
  database().execute<RowDataPacket[]>("SELECT id,branch_id,kind,name,data FROM restaurant_resources WHERE tenant_id=? AND kind IN ('menu_item','menu_category','storefront_config') AND status='active' AND archived=FALSE ORDER BY created_at",[tenant.id]),
  database().execute<RowDataPacket[]>("SELECT id,name FROM branches WHERE tenant_id=? AND enabled=TRUE ORDER BY created_at",[tenant.id])
 ]);
 const user=await currentUserId();let linked=false;
 if(user){const [rows]=await database().execute<RowDataPacket[]>("SELECT c.user_id FROM tenant_customers c JOIN users u ON u.id=c.user_id AND u.status='active' WHERE c.tenant_id=? AND c.user_id=? LIMIT 1",[tenant.id,user]);linked=rows.length>0;}
 const config=resources.find(r=>r.kind==="storefront_config"),branding=config?parseData(config.data):{};
 return <PublicMenu name={String(tenant.name)} slug={slug} branding={branding} items={resources.filter(r=>r.kind==="menu_item").map(r=>{const d=parseData(r.data);return{id:String(r.id),name:String(r.name),branchId:r.branch_id?String(r.branch_id):null,categoryId:d.categoryId?String(d.categoryId):null,price:Number(d.price),description:String(d.description||""),imageUrl:d.imageUrl?String(d.imageUrl):null,allergens:String(d.allergens||"")};})} categories={resources.filter(r=>r.kind==="menu_category").map(r=>({id:String(r.id),name:String(r.name)}))} branches={branches.map(b=>({id:String(b.id),name:String(b.name)}))} signedIn={Boolean(user)} linked={linked}/>;
}
