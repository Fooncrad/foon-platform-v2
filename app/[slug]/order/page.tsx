import {notFound} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {resourceRows,parseData} from "@/lib/restaurant/operations";
import {menuOptions} from "@/lib/restaurant/menu";
import {validStoreSlug} from "@/scripts/store-slug.mjs";
import PublicMenu from "../public-menu";
import "../public-menu.css";
export default async function PublicOrderPage({params}:{params:Promise<{slug:string}>}){
 const {slug:raw}=await params,slug=raw.toLowerCase();if(!validStoreSlug(slug))notFound();
 const [tenants]=await database().execute<RowDataPacket[]>("SELECT id,name FROM tenants WHERE slug=? AND status='active' LIMIT 1",[slug]);const tenant=tenants[0];if(!tenant)notFound();
 const tenantId=String(tenant.id),db=await database().getConnection();
 try{
  const [items,categories,[branches],[brands],[appearances]]=await Promise.all([
   resourceRows(db,tenantId,"menu"),resourceRows(db,tenantId,"categories"),
   db.execute<RowDataPacket[]>("SELECT id,name FROM branches WHERE tenant_id=? AND enabled=TRUE ORDER BY created_at",[tenantId]),
   db.execute<RowDataPacket[]>("SELECT data FROM restaurant_resources WHERE tenant_id=? AND kind='storefront_config' AND archived=FALSE AND status='active' LIMIT 1",[tenantId]),
   db.execute<RowDataPacket[]>("SELECT template_key FROM restaurant_menu_appearance WHERE tenant_id=? LIMIT 1",[tenantId])
  ]);
  const enabledCategories=categories.filter(c=>c.status==="active"),activeItems=items.filter(i=>i.status==="active"&&enabledCategories.some(c=>c.id===i.data.categoryId));
  const branding=brands.length?parseData(brands[0].data):{};branding.menuTheme=String(appearances[0]?.template_key??branding.menuTheme??"sufra");
  const options=await menuOptions(db,tenantId,activeItems.map(i=>i.id)),user=await currentUserId();let linked=false;
  if(user){const [relations]=await db.execute<RowDataPacket[]>("SELECT c.user_id FROM tenant_customers c JOIN users u ON u.id=c.user_id AND u.status='active' WHERE c.tenant_id=? AND c.user_id=? LIMIT 1",[tenantId,user]);linked=relations.length>0;}
  return <PublicMenu name={String(tenant.name)} slug={slug} branding={branding} options={options} items={activeItems.map(i=>({id:i.id,name:i.name,branchId:i.branch_id,categoryId:String(i.data.categoryId),price:Number(i.data.price),description:String(i.data.description||""),imageUrl:i.data.imageUrl?String(i.data.imageUrl):null,allergens:String(i.data.allergens||"")}))} categories={enabledCategories.map(c=>({id:c.id,name:c.name}))} branches={branches.map(b=>({id:String(b.id),name:String(b.name)}))} signedIn={Boolean(user)} linked={linked}/>;
 }finally{db.release();}
}
