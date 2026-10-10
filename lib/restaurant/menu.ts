import {randomUUID,createHash} from "node:crypto";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {ResourceError,validateResource,resourceModules} from "@/scripts/restaurant-resource-schema.mjs";
import {parseData,branchExists,type StoredResource} from "./operations";
import {tenantEntitlement} from "@/lib/plans/entitlements";
export const canonicalMenuModules=["categories","menu","menuGroups","menuValues","menuImages"];
const tables:Record<string,string>={categories:"restaurant_menu_categories",menu:"restaurant_menu_items",menuGroups:"restaurant_menu_option_groups",menuValues:"restaurant_menu_option_values",menuImages:"restaurant_menu_item_images"};
const kinds:Record<string,string>={categories:"menu_category",menu:"menu_item",menuGroups:"menu_option_group",menuValues:"menu_option_value",menuImages:"menu_item_image"};
function asResource(module:string,row:RowDataPacket):StoredResource{
 const metadata=row.metadata?parseData(row.metadata):{};
 let data:Record<string,string|number|null>;
 if(module==="categories")data={description:metadata.description??null,nameEn:metadata.nameEn??null,nameFr:metadata.nameFr??null};
 else if(module==="menu")data={categoryId:String(row.category_id),price:Number(row.price),description:row.description?String(row.description):null,imageUrl:row.image_url?String(row.image_url):null,allergens:metadata.allergens??null,nameEn:metadata.nameEn??null,nameFr:metadata.nameFr??null,descriptionEn:metadata.descriptionEn??null,descriptionFr:metadata.descriptionFr??null};
 else if(module==="menuGroups")data={itemId:String(row.item_id),selectionType:String(row.selection_type),requiredFlag:row.required?"yes":"no",minSelect:Number(row.min_select),maxSelect:Number(row.max_select)};
 else if(module==="menuValues")data={groupId:String(row.group_id),priceDelta:Number(row.price_delta)};
 else data={itemId:String(row.item_id),imageUrl:String(row.image_url)};
 const result={id:String(row.id),name:String(row.name??metadata.name??"صورة الصنف"),status:module==="menuImages"?"active":row.enabled? "active":module==="menu"?"unavailable":"inactive",branch_id:row.branch_id?String(row.branch_id):null,data,version:"",created_at:row.created_at?new Date(row.created_at).toISOString():""};
 result.version=createHash("sha256").update(JSON.stringify({name:result.name,status:result.status,branch:result.branch_id,data})).digest("hex");
 return result;
}
export async function canonicalMenuRows(db:PoolConnection,tenantId:string,module:string,branch?:string|null,id?:string,lock=false){
 const table=tables[module];if(!table)throw new ResourceError("MODULE_NOT_FOUND");
 const [rows]=await db.execute<RowDataPacket[]>("SELECT t.*,m.branch_id,m.data AS metadata FROM "+table+" t LEFT JOIN restaurant_resources m ON m.id=t.id AND m.tenant_id=t.tenant_id AND m.kind=? WHERE t.tenant_id=? AND COALESCE(m.archived,FALSE)=FALSE"+(branch?" AND (m.branch_id=? OR m.branch_id IS NULL)":"")+(id?" AND t.id=?":"")+" ORDER BY t.sort_order,t.id LIMIT 500"+(lock?" FOR UPDATE":""),[kinds[module],tenantId,...(branch?[branch]:[]),...(id?[id]:[])]);
 return rows.map(r=>asResource(module,r));
}
export async function saveCanonicalMenu(db:PoolConnection,tenantId:string,actor:string,module:string,body:Record<string,unknown>,archive=false){
 const id=body.id===undefined?randomUUID():String(body.id);
 const previous=body.id===undefined?null:(await canonicalMenuRows(db,tenantId,module,null,id,true))[0];
 if(body.id!==undefined&&!previous)throw new ResourceError("RESOURCE_NOT_FOUND");
 if(previous&&body.version!==previous.version)throw new ResourceError("CONFLICT");
 const table=tables[module],kind=kinds[module];
 if(archive){
  if(!previous)throw new ResourceError("INVALID_INPUT");
  if(module!=="menuImages")await db.execute("UPDATE "+table+" SET enabled=FALSE WHERE id=? AND tenant_id=?",[id,tenantId]);
  await db.execute("INSERT INTO restaurant_resources(id,tenant_id,kind,name,status,data,archived) VALUES (?,?,?,?,?, ?,TRUE) ON DUPLICATE KEY UPDATE archived=TRUE,version=version+1",[id,tenantId,kind,previous.name,previous.status,JSON.stringify(previous.data)]);
 }else{
  const input=validateResource(module,body);await branchExists(db,tenantId,input.branchId);
  for(const field of resourceModules[module].fields.filter(f=>f.ref)){
   const value=input.data[field.key];if(!value)continue;
   const found=(await canonicalMenuRows(db,tenantId,field.ref!,null,String(value)))[0];
   if(!found||found.status!=="active"||input.branchId&&found.branch_id&&input.branchId!==found.branch_id)throw new ResourceError("REFERENCE_NOT_FOUND");
  }
  if(module==="categories"){
   if(previous)await db.execute("UPDATE restaurant_menu_categories SET name=?,enabled=? WHERE id=? AND tenant_id=?",[input.name,input.status==="active",id,tenantId]);
   else await db.execute("INSERT INTO restaurant_menu_categories(id,tenant_id,name,enabled) VALUES (?,?,?,?)",[id,tenantId,input.name,input.status==="active"]);
  }else if(module==="menu"){
   if(previous)await db.execute("UPDATE restaurant_menu_items SET category_id=?,name=?,description=?,price=?,image_url=?,enabled=? WHERE id=? AND tenant_id=?",[input.data.categoryId,input.name,input.data.description,input.data.price,input.data.imageUrl,input.status==="active",id,tenantId]);
   else await db.execute("INSERT INTO restaurant_menu_items(id,tenant_id,category_id,name,description,price,image_url,enabled) VALUES (?,?,?,?,?,?,?,?)",[id,tenantId,input.data.categoryId,input.name,input.data.description,input.data.price,input.data.imageUrl,input.status==="active"]);
  }else if(module==="menuGroups"){
   const min=Number(input.data.minSelect??(input.data.requiredFlag==="yes"?1:0)),max=Number(input.data.maxSelect??1);
   if(min>max||input.data.selectionType==="single"&&max!==1)throw new ResourceError("INVALID_OPTIONS");
   if(previous)await db.execute("UPDATE restaurant_menu_option_groups SET item_id=?,name=?,selection_type=?,required=?,min_select=?,max_select=?,enabled=? WHERE id=? AND tenant_id=?",[input.data.itemId,input.name,input.data.selectionType,input.data.requiredFlag==="yes",min,max,input.status==="active",id,tenantId]);
   else await db.execute("INSERT INTO restaurant_menu_option_groups(id,tenant_id,item_id,name,selection_type,required,min_select,max_select,enabled) VALUES (?,?,?,?,?,?,?,?,?)",[id,tenantId,input.data.itemId,input.name,input.data.selectionType,input.data.requiredFlag==="yes",min,max,input.status==="active"]);
  }else if(module==="menuValues"){
   if(previous)await db.execute("UPDATE restaurant_menu_option_values SET group_id=?,name=?,price_delta=?,enabled=? WHERE id=? AND tenant_id=?",[input.data.groupId,input.name,input.data.priceDelta,input.status==="active",id,tenantId]);
   else await db.execute("INSERT INTO restaurant_menu_option_values(id,tenant_id,group_id,name,price_delta,enabled) VALUES (?,?,?,?,?,?)",[id,tenantId,input.data.groupId,input.name,input.data.priceDelta,input.status==="active"]);
  }else{
   if(previous)await db.execute("UPDATE restaurant_menu_item_images SET item_id=?,image_url=? WHERE id=? AND tenant_id=?",[input.data.itemId,input.data.imageUrl,id,tenantId]);
   else await db.execute("INSERT INTO restaurant_menu_item_images(id,tenant_id,item_id,image_url) VALUES (?,?,?,?)",[id,tenantId,input.data.itemId,input.data.imageUrl]);
  }
  await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE branch_id=VALUES(branch_id),name=VALUES(name),status=VALUES(status),data=VALUES(data),version=version+1",[id,tenantId,input.branchId,kind,input.name,input.status,JSON.stringify(input.data)]);
 }
 await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id) VALUES (?,?,?,?)",[tenantId,actor,module+(archive?".archive":".save"),id]);
 return{id};
}
export type MenuChoice={id:string;name:string;price:number};
export type MenuGroup={id:string;name:string;type:string;required:boolean;min:number;max:number;values:MenuChoice[]};
export async function menuOptions(db:PoolConnection,tenantId:string,itemIds:string[]){
 const result:Record<string,MenuGroup[]>={};
 if(!itemIds.length)return result;
 if(!(await tenantEntitlement(tenantId,"variants")).enabled)return result;
 const [groups]=await db.execute<RowDataPacket[]>("SELECT id,item_id,name,selection_type,required,min_select,max_select FROM restaurant_menu_option_groups WHERE tenant_id=? AND enabled=TRUE AND item_id IN ("+itemIds.map(()=>"?").join(",")+") ORDER BY sort_order,id",[tenantId,...itemIds]);
 if(!groups.length)return result;
 const [values]=await db.execute<RowDataPacket[]>("SELECT id,group_id,name,price_delta FROM restaurant_menu_option_values WHERE tenant_id=? AND enabled=TRUE AND group_id IN ("+groups.map(()=>"?").join(",")+") ORDER BY sort_order,id",[tenantId,...groups.map(g=>g.id)]);
 for(const g of groups){(result[String(g.item_id)]??=[]).push({id:String(g.id),name:String(g.name),type:String(g.selection_type),required:Boolean(g.required),min:Number(g.min_select),max:Number(g.max_select),values:values.filter(v=>v.group_id===g.id).map(v=>({id:String(v.id),name:String(v.name),price:Number(v.price_delta)}))});}
 return result;
}
