import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {validFloorPlan} from "@/lib/restaurant/floor-plan";
const uuid=/^[a-f0-9-]{36}$/i;
async function scope(req:Request,write:boolean){
 const user=await currentUserId();if(!user)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=req.headers.get("x-foon-tenant"),branch=new URL(req.url).searchParams.get("branch");
 if(!tenant||!branch)return {error:NextResponse.json({ok:false,code:"BRANCH_REQUIRED"},{status:400})};
 try{const membership=await requireTenantMembership(user,tenant,["owner","manager"],write);
 if(write)await requireAllAdditionalBranchesUnlocked(membership.tenantId,user);
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[branch,membership.tenantId]);
 if(!rows.length)return {error:NextResponse.json({ok:false,code:"BRANCH_NOT_FOUND"},{status:404})};
 return {tenant:membership.tenantId,branch};
 }catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}}
}
function decode(value:unknown){try{const x=typeof value==="string"?JSON.parse(value):value;return validFloorPlan(x)?x:null}catch{return null}}
async function sectionExists(tenant:string,branch:string,section:string){
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='dining_section' AND archived=FALSE AND status='active' AND (branch_id=? OR branch_id IS NULL) LIMIT 1",[tenant,section,branch]);return rows.length>0;
}
export async function GET(req:Request){const c=await scope(req,false);if(c.error)return c.error;
 // Return the existing section catalog independently of optional floor-plan migrations.
 if(new URL(req.url).searchParams.get("view")==="sections"){
  try{
   const [rows]=await database().execute<RowDataPacket[]>("SELECT id,name,status,branch_id FROM restaurant_resources WHERE tenant_id=? AND kind='dining_section' AND archived=FALSE AND (branch_id=? OR branch_id IS NULL) ORDER BY name LIMIT 200",[c.tenant,c.branch]);
   return NextResponse.json({ok:true,sections:rows.map(r=>({id:String(r.id),name:String(r.name),status:String(r.status)}))},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({ok:false,code:"SECTIONS_UNAVAILABLE"},{status:503})}
 }

 try{
 const [sections]=await database().execute<RowDataPacket[]>("SELECT id,name FROM restaurant_resources WHERE tenant_id=? AND kind='dining_section' AND archived=FALSE AND (branch_id=? OR branch_id IS NULL) ORDER BY name LIMIT 200",[c.tenant,c.branch]);
 const [layouts]=await database().execute<RowDataPacket[]>("SELECT id,section_id,name,layout_json,is_active FROM restaurant_floor_plan_layouts WHERE tenant_id=? AND branch_id=? ORDER BY created_at,id LIMIT 500",[c.tenant,c.branch]);
 const items=[];for(const l of layouts){const plan=decode(l.layout_json);if(!plan)return NextResponse.json({ok:false,code:"FLOOR_LAYOUT_INVALID"},{status:409});items.push({id:String(l.id),sectionId:String(l.section_id),name:String(l.name),active:Boolean(l.is_active),plan})}
 const [operations]=await database().execute<RowDataPacket[]>("SELECT layout_id,floor_table_id,status FROM restaurant_floor_table_operations WHERE tenant_id=? AND branch_id=?",[c.tenant,c.branch]);
 const [registeredTables]=await database().execute<RowDataPacket[]>("SELECT id,name,status,data FROM restaurant_resources WHERE tenant_id=? AND kind='dining_table' AND archived=FALSE AND (branch_id=? OR branch_id IS NULL) ORDER BY name LIMIT 1000",[c.tenant,c.branch]);
 const [links]=await database().execute<RowDataPacket[]>("SELECT layout_id,floor_table_id,dining_table_id FROM restaurant_floor_table_links WHERE tenant_id=? AND branch_id=?",[c.tenant,c.branch]);
 const [legacy]=await database().execute<RowDataPacket[]>("SELECT layout_json FROM restaurant_floor_plans WHERE tenant_id=? AND branch_id=? LIMIT 1",[c.tenant,c.branch]);
 let legacyPlan=null;if(legacy.length){legacyPlan=decode(legacy[0].layout_json);if(!legacyPlan)return NextResponse.json({ok:false,code:"LEGACY_LAYOUT_INVALID"},{status:409})}
 return NextResponse.json({ok:true,sections:sections.map(s=>({id:String(s.id),name:String(s.name)})),layouts:items,registeredTables:registeredTables.map(t=>({id:String(t.id),name:String(t.name),status:String(t.status),sectionId:String((typeof t.data==="string"?JSON.parse(t.data):t.data)?.sectionId||"")})),links:links.map(l=>({layoutId:String(l.layout_id),tableId:String(l.floor_table_id),diningTableId:String(l.dining_table_id)})),operations:operations.map(o=>({layoutId:String(o.layout_id),tableId:String(o.floor_table_id),status:String(o.status)})),legacyPlan},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({ok:false,code:"LAYOUTS_UNAVAILABLE"},{status:503})}}
export async function POST(req:Request){try{assertSameOrigin(req)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const c=await scope(req,true);if(c.error)return c.error;let input:unknown;try{input=await readLimitedJson(req,131072)}catch(error){const tooLarge=error instanceof Error&&error.message==="BATCH_TOO_LARGE";return NextResponse.json({ok:false,code:tooLarge?"BODY_TOO_LARGE":"INVALID_INPUT"},{status:tooLarge?413:400})}
 if(!input||typeof input!=="object")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const b=input as Record<string,unknown>;if(typeof b.sectionId!=="string"||!uuid.test(b.sectionId)||typeof b.name!=="string"||!b.name.trim()||b.name.length>120||!validFloorPlan(b.plan))return NextResponse.json({ok:false,code:"INVALID_LAYOUT"},{status:400});
 try{if(!await sectionExists(c.tenant!,c.branch!,b.sectionId))return NextResponse.json({ok:false,code:"SECTION_NOT_FOUND"},{status:404});
 const id=randomUUID();await database().execute("INSERT INTO restaurant_floor_plan_layouts(id,tenant_id,branch_id,section_id,name,layout_json) VALUES (?,?,?,?,?,?)",[id,c.tenant,c.branch,b.sectionId,b.name.trim(),JSON.stringify(b.plan)]);return NextResponse.json({ok:true,id},{status:201})
 }catch{return NextResponse.json({ok:false,code:"LAYOUT_SAVE_FAILED"},{status:503})}}
export async function PUT(req:Request){try{assertSameOrigin(req)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const c=await scope(req,true);if(c.error)return c.error;let input:unknown;try{input=await readLimitedJson(req,131072)}catch(error){const tooLarge=error instanceof Error&&error.message==="BATCH_TOO_LARGE";return NextResponse.json({ok:false,code:tooLarge?"BODY_TOO_LARGE":"INVALID_INPUT"},{status:tooLarge?413:400})}
 if(!input||typeof input!=="object")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const b=input as Record<string,unknown>;if(typeof b.id!=="string"||!uuid.test(b.id)||typeof b.sectionId!=="string"||!uuid.test(b.sectionId)||typeof b.name!=="string"||!b.name.trim()||b.name.length>120||!validFloorPlan(b.plan))return NextResponse.json({ok:false,code:"INVALID_LAYOUT"},{status:400});
 try{
  if(!await sectionExists(c.tenant!,c.branch!,b.sectionId))return NextResponse.json({ok:false,code:"SECTION_NOT_FOUND"},{status:404});
  const db=await database().getConnection();
  try{
   await db.beginTransaction();
   // Serialize layout edits with table-link/status writes; old links must never
   // reserve a real table after its drawn table was removed or moved to a new section.
   const [existing]=await db.execute<RowDataPacket[]>("SELECT section_id FROM restaurant_floor_plan_layouts WHERE id=? AND tenant_id=? AND branch_id=? FOR UPDATE",[b.id,c.tenant,c.branch]);
   if(!existing.length){await db.rollback();return NextResponse.json({ok:false,code:"LAYOUT_NOT_FOUND"},{status:404})}
   await db.execute("UPDATE restaurant_floor_plan_layouts SET section_id=?,name=?,layout_json=? WHERE id=? AND tenant_id=? AND branch_id=?",[b.sectionId,b.name.trim(),JSON.stringify(b.plan),b.id,c.tenant,c.branch]);
   const ids=(b.plan as {tables:{id:string}[]}).tables.map(t=>t.id);
   const params=[c.tenant,c.branch,b.id];
   const sectionChanged=String(existing[0].section_id)!==b.sectionId;
   const staleFilter=sectionChanged||!ids.length?"":" AND floor_table_id NOT IN ("+ids.map(()=>"?").join(",")+")";
   const args=staleFilter?[...params,...ids]:params;
   await db.execute("DELETE FROM restaurant_floor_table_links WHERE tenant_id=? AND branch_id=? AND layout_id=?"+staleFilter,args);
   await db.execute("DELETE FROM restaurant_floor_table_operations WHERE tenant_id=? AND branch_id=? AND layout_id=?"+staleFilter,args);
   await db.commit();
   return NextResponse.json({ok:true});
  }catch(error){await db.rollback();throw error}finally{db.release()}
 }catch{return NextResponse.json({ok:false,code:"LAYOUT_SAVE_FAILED"},{status:503})}
}

export async function PATCH(req:Request){
 try{assertSameOrigin(req)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const c=await scope(req,true);if(c.error)return c.error;
 let input:unknown;try{input=await readLimitedJson(req,4096)}catch(error){const tooLarge=error instanceof Error&&error.message==="BATCH_TOO_LARGE";return NextResponse.json({ok:false,code:tooLarge?"BODY_TOO_LARGE":"INVALID_INPUT"},{status:tooLarge?413:400})}
 if(!input||typeof input!=="object")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const b=input as Record<string,unknown>;
 if(typeof b.id!=="string"||!uuid.test(b.id))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{
  const db=await database().getConnection();
  try{
   await db.beginTransaction();
   const [layouts]=await db.execute<RowDataPacket[]>("SELECT layout_json FROM restaurant_floor_plan_layouts WHERE id=? AND tenant_id=? AND branch_id=? FOR UPDATE",[b.id,c.tenant,c.branch]);
   if(!layouts.length){await db.rollback();return NextResponse.json({ok:false,code:"LAYOUT_NOT_FOUND"},{status:404})}
   if(b.action==="linkTable"&&typeof b.tableId==="string"&&/^[a-z0-9-]{1,60}$/i.test(b.tableId)&&(b.diningTableId===null||(typeof b.diningTableId==="string"&&uuid.test(b.diningTableId)))){
    const layout=decode(layouts[0].layout_json);
    const [[section]]=await db.execute<RowDataPacket[]>("SELECT section_id FROM restaurant_floor_plan_layouts WHERE id=? AND tenant_id=? AND branch_id=?",[b.id,c.tenant,c.branch]);
    if(!layout||!layout.tables.some(t=>t.id===b.tableId)){await db.rollback();return NextResponse.json({ok:false,code:"TABLE_NOT_IN_LAYOUT"},{status:400})}
    if(b.diningTableId===null)await db.execute("DELETE FROM restaurant_floor_table_links WHERE tenant_id=? AND branch_id=? AND layout_id=? AND floor_table_id=?",[c.tenant,c.branch,b.id,b.tableId]);
    else{
     const [real]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='dining_table' AND archived=FALSE AND status<>'inactive' AND (branch_id=? OR branch_id IS NULL) AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.sectionId'))=? LIMIT 1",[c.tenant,b.diningTableId,c.branch,String(section.section_id)]);
     if(!real.length){await db.rollback();return NextResponse.json({ok:false,code:"DINING_TABLE_SECTION_MISMATCH"},{status:409})}
     const [already]=await db.execute<RowDataPacket[]>("SELECT layout_id,floor_table_id FROM restaurant_floor_table_links WHERE tenant_id=? AND branch_id=? AND dining_table_id=? FOR UPDATE",[c.tenant,c.branch,b.diningTableId]);
     if(already.some(a=>String(a.layout_id)!==b.id||String(a.floor_table_id)!==b.tableId)){await db.rollback();return NextResponse.json({ok:false,code:"DINING_TABLE_ALREADY_LINKED"},{status:409})}
     await db.execute("INSERT INTO restaurant_floor_table_links(tenant_id,branch_id,layout_id,floor_table_id,dining_table_id) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE dining_table_id=VALUES(dining_table_id)",[c.tenant,c.branch,b.id,b.tableId,b.diningTableId]);
    }
   }else if(b.action==="activate"&&typeof b.active==="boolean"){
    // Multiple active plans can coexist under the same dining section.
    await db.execute("UPDATE restaurant_floor_plan_layouts SET is_active=? WHERE id=? AND tenant_id=? AND branch_id=?",[b.active,b.id,c.tenant,c.branch]);
   }else if(b.action==="tableStatus"&&typeof b.tableId==="string"&&/^[a-z0-9-]{1,60}$/i.test(b.tableId)&&typeof b.status==="string"&&["available","occupied","reserved","cleaning","out_of_service"].includes(b.status)){
    const layout=decode(layouts[0].layout_json);
    if(!layout||!layout.tables.some(t=>t.id===b.tableId)){await db.rollback();return NextResponse.json({ok:false,code:"TABLE_NOT_IN_LAYOUT"},{status:400})}
    // These are MANUAL operational annotations only; reservation engine is authoritative.
    await db.execute("INSERT INTO restaurant_floor_table_operations(tenant_id,branch_id,layout_id,floor_table_id,status) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)",[c.tenant,c.branch,b.id,b.tableId,b.status]);
   }else{await db.rollback();return NextResponse.json({ok:false,code:"INVALID_ACTION"},{status:400})}
   await db.commit();return NextResponse.json({ok:true});
  }catch(error){await db.rollback();throw error}finally{db.release()}
 }catch{return NextResponse.json({ok:false,code:"OPERATION_SAVE_FAILED"},{status:503})}
}
