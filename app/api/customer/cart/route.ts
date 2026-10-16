import {catalogQuantityPolicy} from "@/lib/platform/catalog-measurements";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {customerCartAvailable} from "@/lib/platform/customer-checkout";
import {activityPosOptions} from "@/lib/restaurant/activity-pos";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {ResourceError} from "@/scripts/restaurant-resource-schema.mjs";
import {validStoreSlug} from "@/scripts/store-slug.mjs";
export const runtime="nodejs";
export async function GET(request:Request){
 const query=new URL(request.url).searchParams,slug=query.get("store")??"",id=query.get("product")??"";
 if(!validStoreSlug(slug)||!/^[-a-f0-9]{36}$/i.test(id))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  const [stores]=await db.execute<RowDataPacket[]>("SELECT t.id,t.kind,b.activity_code FROM tenants t LEFT JOIN tenant_business_profiles b ON b.tenant_id=t.id WHERE t.slug=? AND t.status='active' LIMIT 1",[slug]);
  const store=stores[0];if(!store)return NextResponse.json({ok:false,code:"ITEM_UNAVAILABLE"},{status:404});
  if(!customerCartAvailable(String(store.activity_code??""),String(store.kind)))return NextResponse.json({ok:false,code:"CART_NOT_AVAILABLE"},{status:403});
  if(!(await tenantEntitlement(String(store.id),"orders",db)).enabled)return NextResponse.json({ok:false,code:"PLAN_FEATURE_REQUIRED"},{status:403});
  const [rows]=await db.execute<RowDataPacket[]>("SELECT p.id,p.name_ar,p.name_en,p.name_fr,p.price,p.currency,p.branch_id,p.stock_quantity,p.product_type,p.attributes,c.branch_id AS category_branch FROM catalog_products p JOIN catalog_categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id WHERE p.id=? AND p.tenant_id=? AND p.enabled=TRUE AND c.enabled=TRUE LIMIT 1",[id,store.id]);
  const p=rows[0];if(!p||p.product_type!=="service"&&p.stock_quantity!==null&&Number(p.stock_quantity)<=0)return NextResponse.json({ok:false,code:"ITEM_UNAVAILABLE"},{status:404});
  const [branches]=await db.execute<RowDataPacket[]>("SELECT id,name FROM branches WHERE tenant_id=? AND enabled=TRUE AND (? IS NULL OR id=?) AND (? IS NULL OR id=?) ORDER BY created_at",[store.id,p.branch_id,p.branch_id,p.category_branch,p.category_branch]);
  if(!branches.length)return NextResponse.json({ok:false,code:"ITEM_UNAVAILABLE"},{status:404});
  const options=await activityPosOptions(db,String(store.id),[id]);
  const [variants]=await db.execute<RowDataPacket[]>("SELECT option_ids,stock_quantity,enabled FROM catalog_variants WHERE tenant_id=? AND product_id=?",[store.id,id]);
  return NextResponse.json({ok:true,item:{...catalogQuantityPolicy(p.attributes),variants:variants.map(v=>({options:typeof v.option_ids==="string"?JSON.parse(v.option_ids):v.option_ids,stock:v.enabled?(v.stock_quantity===null?null:Number(v.stock_quantity)):0})),id:String(p.id),name:String(p.name_ar),nameEn:String(p.name_en??""),nameFr:String(p.name_fr??""),price:Number(p.price),currency:String(p.currency),branches:branches.map(b=>({id:String(b.id),name:String(b.name)}))},groups:options[id]??[]},{headers:{"Cache-Control":"no-store"}});
 }catch(error){const code=error instanceof ResourceError?error.code:"CART_UNAVAILABLE";return NextResponse.json({ok:false,code},{status:code==="PLAN_FEATURE_REQUIRED"?403:503});}finally{db.release();}
}
