import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {isActivityType} from "@/lib/platform/activity-presets";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {ResourceError} from "@/scripts/restaurant-resource-schema.mjs";
import type {MenuGroup} from "./menu";

export type StockDebit={kind:"product"|"option";id:string;quantity:number};
export async function salesProfile(db:PoolConnection,tenantId:string){
 const [rows]=await db.execute<RowDataPacket[]>("SELECT activity_code,currency FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[tenantId]);
 const activity=String(rows[0]?.activity_code??"");
 // Preserve the existing restaurant catalog for legacy tenants without a supported profile.
 const catalog=isActivityType(activity)&&activity!=="restaurant";
 const currency=catalog?String(rows[0]?.currency??"SAR"):"SAR";
 if(!/^[A-Z]{3}$/.test(currency))throw new ResourceError("UNSUPPORTED_CURRENCY");
 return {catalog,currency,dining:!catalog||activity==="cafe"};
}
export async function activityPosMenu(db:PoolConnection,tenantId:string,branch:string|null){
 const [rows]=await db.execute<RowDataPacket[]>("SELECT p.id,p.branch_id,p.name_ar,p.price,p.currency,p.product_type,p.stock_quantity,p.created_at,c.name_ar AS category_name FROM catalog_products p JOIN catalog_categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id WHERE p.tenant_id=? AND p.enabled=TRUE AND c.enabled=TRUE"+(branch?" AND (p.branch_id IS NULL OR p.branch_id=?) AND (c.branch_id IS NULL OR c.branch_id=?)":"")+" ORDER BY c.sort_order,p.sort_order,p.id LIMIT 1000",branch?[tenantId,branch,branch]:[tenantId]);
 return rows.map(p=>({id:String(p.id),branch_id:p.branch_id,name:String(p.name_ar),status:p.product_type!=="service"&&p.stock_quantity!==null&&Number(p.stock_quantity)<=0?"unavailable":"active",version:1,created_at:p.created_at,data:{price:Number(p.price),currency:String(p.currency),categoryName:String(p.category_name),stockQuantity:p.stock_quantity===null?null:Number(p.stock_quantity)}}));
}
export async function activityPosOptions(db:PoolConnection,tenantId:string,ids:string[],lock=false){
 const result:Record<string,MenuGroup[]>={};if(!ids.length)return result;
 const [groups]=await db.execute<RowDataPacket[]>("SELECT id,product_id,name_ar,selection_type,required,min_select,max_select FROM catalog_option_groups WHERE tenant_id=? AND enabled=TRUE AND product_id IN ("+ids.map(()=>"?").join(",")+") ORDER BY id"+(lock?" FOR UPDATE":""),[tenantId,...ids]);
 if(!groups.length)return result;
 if(!(await tenantEntitlement(tenantId,"variants")).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
 const [values]=await db.execute<RowDataPacket[]>("SELECT id,group_id,name_ar,price_delta FROM catalog_option_values WHERE tenant_id=? AND enabled=TRUE AND group_id IN ("+groups.map(()=>"?").join(",")+") ORDER BY id"+(lock?" FOR UPDATE":""),[tenantId,...groups.map(g=>g.id)]);
 for(const g of groups)(result[String(g.product_id)]??=[]).push({id:String(g.id),name:String(g.name_ar),type:String(g.selection_type),required:Boolean(g.required),min:Number(g.min_select),max:Number(g.max_select),values:values.filter(v=>String(v.group_id)===String(g.id)).map(v=>({id:String(v.id),name:String(v.name_ar),price:Number(v.price_delta)}))});
 return result;
}
export async function activitySaleItem(db:PoolConnection,tenantId:string,branch:string,id:string):Promise<RowDataPacket>{
 const [rows]=await db.execute<RowDataPacket[]>("SELECT p.*,c.name_ar AS category_name,c.branch_id AS category_branch FROM catalog_products p JOIN catalog_categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id WHERE p.id=? AND p.tenant_id=? AND p.enabled=TRUE AND c.enabled=TRUE FOR UPDATE",[id,tenantId]);
 const p=rows[0];if(!p||p.branch_id&&p.branch_id!==branch||p.category_branch&&p.category_branch!==branch)throw new ResourceError("ITEM_UNAVAILABLE");
 return Object.assign(p,{name:String(p.name_ar)});
}
export async function debitActivityStock(db:PoolConnection,tenantId:string,kind:StockDebit["kind"],id:string,quantity:number,debits:StockDebit[]){
 const table=kind==="product"?"catalog_products":"catalog_option_values";
 const [rows]=await db.execute<RowDataPacket[]>("SELECT stock_quantity"+(kind==="product"?",product_type":"")+" FROM "+table+" WHERE id=? AND tenant_id=? FOR UPDATE",[id,tenantId]);
 if(!rows.length)throw new ResourceError("ITEM_UNAVAILABLE");
 if(rows[0].stock_quantity===null||rows[0].product_type==="service")return;
 const stock=Number(rows[0].stock_quantity);if(!Number.isFinite(stock)||stock<quantity)throw new ResourceError("INSUFFICIENT_STOCK");
 await db.execute("UPDATE "+table+" SET stock_quantity=stock_quantity-? WHERE id=? AND tenant_id=?",[quantity,id,tenantId]);
 debits.push({kind,id,quantity});
}
export async function ensureActivitySaleReference(db:PoolConnection,tenantId:string,p:RowDataPacket){
 // The existing order-line FK requires both records. These disabled references are
 // never a price source or a second editable catalog; line snapshots remain authoritative.
 const [resources]=await db.execute<RowDataPacket[]>("SELECT tenant_id,kind FROM restaurant_resources WHERE id=? FOR UPDATE",[p.id]);
 if(resources.length&&(resources[0].tenant_id!==tenantId||resources[0].kind!=="activity_sale_item"))throw new ResourceError("CATALOG_REFERENCE_CONFLICT");
 await db.execute("INSERT IGNORE INTO restaurant_menu_categories(id,tenant_id,name,enabled) VALUES (?,?,?,FALSE)",[p.category_id,tenantId,p.category_name]);
 const [categories]=await db.execute<RowDataPacket[]>("SELECT tenant_id FROM restaurant_menu_categories WHERE id=?",[p.category_id]);
 if(categories[0]?.tenant_id!==tenantId)throw new ResourceError("CATALOG_REFERENCE_CONFLICT");
 await db.execute("INSERT IGNORE INTO restaurant_menu_items(id,tenant_id,category_id,name,price,currency,enabled) VALUES (?,?,?,?,?,?,FALSE)",[p.id,tenantId,p.category_id,p.name,p.price,p.currency]);
 const [items]=await db.execute<RowDataPacket[]>("SELECT tenant_id FROM restaurant_menu_items WHERE id=?",[p.id]);
 if(items[0]?.tenant_id!==tenantId)throw new ResourceError("CATALOG_REFERENCE_CONFLICT");
 if(!resources.length)await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data) VALUES (?,?,?,'activity_sale_item',?,'active','{}')",[p.id,tenantId,p.branch_id,p.name]);
}
export async function restoreActivityStock(db:PoolConnection,tenantId:string,orderId:string){
 // Use the committed create event, not mutable catalog/resource metadata. A valid
 // cancellation transition and the order row lock ensure this runs exactly once.
 const [events]=await db.execute<RowDataPacket[]>("SELECT metadata FROM restaurant_audit_events WHERE tenant_id=? AND resource_id=? AND action='order.create' ORDER BY id LIMIT 1",[tenantId,orderId]);
 if(!events.length)return;
 const metadata=typeof events[0].metadata==="string"?JSON.parse(events[0].metadata):events[0].metadata;
 if(!Array.isArray(metadata?.stockDebits))return;
 const debits=metadata.stockDebits as StockDebit[];
 for(const d of [...debits].sort((a,b)=>(a.kind+a.id).localeCompare(b.kind+b.id))){
  if(!["product","option"].includes(d.kind)||typeof d.id!=="string"||!Number.isSafeInteger(d.quantity)||d.quantity<1)throw new ResourceError("STOCK_RESTORE_CONFLICT");
  const table=d.kind==="product"?"catalog_products":"catalog_option_values";
  const [rows]=await db.execute<RowDataPacket[]>("SELECT stock_quantity FROM "+table+" WHERE id=? AND tenant_id=? FOR UPDATE",[d.id,tenantId]);
  if(!rows.length||rows[0].stock_quantity===null)continue;
  if(Number(rows[0].stock_quantity)+d.quantity>999999999)throw new ResourceError("STOCK_RESTORE_CONFLICT");
  await db.execute("UPDATE "+table+" SET stock_quantity=stock_quantity+? WHERE id=? AND tenant_id=?",[d.quantity,d.id,tenantId]);
 }
}
