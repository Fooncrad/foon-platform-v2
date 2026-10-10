import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {resourceRows,parseData} from "./operations";
import {menuOptions} from "./menu";
import {tenantEntitlement} from "@/lib/plans/entitlements";
export async function publicMenuData(tenant:{id:string;name:string},slug:string){
 const tenantId=tenant.id,db=await database().getConnection();
 try{
  const [items,categories,[branches],[brands],[appearances]]=await Promise.all([
   resourceRows(db,tenantId,"menu"),resourceRows(db,tenantId,"categories"),
   db.execute<RowDataPacket[]>("SELECT id,name FROM branches WHERE tenant_id=? AND enabled=TRUE ORDER BY created_at",[tenantId]),
   db.execute<RowDataPacket[]>("SELECT data FROM restaurant_resources WHERE tenant_id=? AND kind='storefront_config' AND archived=FALSE AND status='active' LIMIT 1",[tenantId]),
   db.execute<RowDataPacket[]>("SELECT template_key,color_mode FROM restaurant_menu_appearance WHERE tenant_id=? LIMIT 1",[tenantId])
  ]);
  const enabledCategories=categories.filter(c=>c.status==="active"),activeItems=items.filter(i=>i.status==="active"&&enabledCategories.some(c=>c.id===i.data.categoryId));
  const branding=brands.length?parseData(brands[0].data):{};branding.menuTheme=String(appearances[0]?.template_key??branding.menuTheme??"sufra");
  const imageRows=await resourceRows(db,tenantId,"menuImages");
  const options=await menuOptions(db,tenantId,activeItems.map(i=>i.id)),user=await currentUserId();let linked=false;
  if(user){const [relations]=await db.execute<RowDataPacket[]>("SELECT c.user_id FROM tenant_customers c JOIN users u ON u.id=c.user_id AND u.status='active' WHERE c.tenant_id=? AND c.user_id=? LIMIT 1",[tenantId,user]);linked=relations.length>0;}

  branding.colorMode=String(appearances[0]?.color_mode??"template");
  const [tableAccess,reservationAccess]=await Promise.all([tenantEntitlement(tenantId,"tables"),tenantEntitlement(tenantId,"reservations")]);
  const sections=tableAccess.enabled?(await resourceRows(db,tenantId,"sections")).filter(s=>s.status==="active").map(s=>({id:s.id,name:s.name,branchId:s.branch_id})):[];
  const tables=tableAccess.enabled?(await resourceRows(db,tenantId,"tables")).filter(t=>t.status!=="inactive").filter(t=>!t.data.sectionId||sections.some(s=>s.id===t.data.sectionId)).map(t=>({id:t.id,name:t.name,branchId:t.branch_id,sectionId:t.data.sectionId?String(t.data.sectionId):null,sectionName:sections.find(s=>s.id===t.data.sectionId)?.name,capacity:Number(t.data.capacity)})):[];
  return {name:tenant.name,slug,branding,options,services:{waiter:tableAccess.enabled,reservations:reservationAccess.enabled},tables,sections,items:activeItems.map(i=>({id:i.id,name:i.name,nameEn:String(i.data.nameEn||""),nameFr:String(i.data.nameFr||""),descriptionEn:String(i.data.descriptionEn||""),descriptionFr:String(i.data.descriptionFr||""),branchId:i.branch_id,categoryId:String(i.data.categoryId),price:Number(i.data.price),description:String(i.data.description||""),imageUrl:i.data.imageUrl?String(i.data.imageUrl):null,allergens:String(i.data.allergens||""),oldPrice:Number(i.data.oldPrice||0)>Number(i.data.price)?Number(i.data.oldPrice):null,images:imageRows.filter(image=>image.data.itemId===i.id&&(!image.branch_id||image.branch_id===i.branch_id)).map(image=>String(image.data.imageUrl)).slice(0,4),quantity:typeof i.data.quantity==="number"?i.data.quantity:null,calories:typeof i.data.calories==="number"?i.data.calories:null,nutrition:typeof i.data.nutrition==="string"?i.data.nutrition:""})),categories:enabledCategories.map(c=>({id:c.id,name:c.name,nameEn:String(c.data.nameEn||""),nameFr:String(c.data.nameFr||"")})),branches:branches.map(b=>({id:String(b.id),name:String(b.name)})),signedIn:Boolean(user),linked};
 }finally{db.release();}
}
