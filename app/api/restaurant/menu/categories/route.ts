import {assertCatalogCapacity} from "@/lib/plans/catalog-capacity";
import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";

export const runtime="nodejs";
type CategoryInput={id?:unknown;name?:unknown;nameEn?:unknown;nameFr?:unknown;imageUrl?:unknown};

async function scope(request:Request){
 const userId=await currentUserId();
 if(!userId)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=request.headers.get("x-foon-tenant");
 if(!tenant)return {error:NextResponse.json({ok:false,code:"TENANT_CONTEXT_REQUIRED"},{status:400})};
 try{
  const ctx=await requireTenantMembership(userId,tenant,["owner","manager"],request.method!=="GET");
  if(request.method!=="GET")await requireAllAdditionalBranchesUnlocked(ctx.tenantId,userId);
  const [rows]=await database().execute<RowDataPacket[]>("SELECT kind FROM tenants WHERE id=? AND status='active' LIMIT 1",[ctx.tenantId]);
  if(rows[0]?.kind!=="restaurant")return {error:NextResponse.json({ok:false,code:"RESTAURANT_ONLY"},{status:403})};
  return {tenantId:ctx.tenantId,userId};
 }catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}}
}
function names(body:CategoryInput|null){
 if(!body||typeof body.name!=="string")return null;
 const name=body.name.trim();
 if(!name||name.length>180)return null;
 for(const key of ["nameEn","nameFr"] as const){
  if(body[key]!==undefined&&(typeof body[key]!=="string"||body[key].length>180))return null;
 }
 return {name,nameEn:typeof body.nameEn==="string"?body.nameEn.trim():"",nameFr:typeof body.nameFr==="string"?body.nameFr.trim():""};
}
function metadata(value:unknown):Record<string,unknown>{
 try{
  const parsed=typeof value==="string"?JSON.parse(value):value;
  return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};
 }catch{return {}}
}
function writeError(error:unknown){
 const code=error instanceof Error?error.message:"";
 const status=code==="CATEGORY_NOT_FOUND"?404:["PLAN_LIMIT_REACHED","PLAN_FEATURE_REQUIRED"].includes(code)?403:503;
 return NextResponse.json({ok:false,code:status===503?"MENU_SAVE_FAILED":code},{status});
}

export async function GET(request:Request){
 const ctx=await scope(request);if(ctx.error)return ctx.error;
 try{
  const [categories]=await database().execute<RowDataPacket[]>(
   "SELECT c.id,c.name,c.sort_order,c.enabled,COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.nameEn')),'') AS nameEn,COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.nameFr')),'') AS nameFr,JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.imageUrl')) AS imageUrl FROM restaurant_menu_categories c LEFT JOIN restaurant_resources r ON r.id=c.id AND r.tenant_id=c.tenant_id AND r.kind='menu_category' AND r.archived=FALSE WHERE c.tenant_id=? ORDER BY c.sort_order,c.name",
   [ctx.tenantId]
  );
  return NextResponse.json({ok:true,categories});
 }catch{return NextResponse.json({ok:false,code:"MENU_UNAVAILABLE"},{status:503})}
}
export async function POST(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const ctx=await scope(request);if(ctx.error)return ctx.error;
 const values=names(await request.json().catch(()=>null) as CategoryInput|null);
 if(!values)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const id=randomUUID(),connection=await database().getConnection();
 try{
  await connection.beginTransaction();
  await assertCatalogCapacity(connection,ctx.tenantId!,true,"category");
  await connection.execute("INSERT INTO restaurant_menu_categories(id,tenant_id,name) VALUES (?,?,?)",[id,ctx.tenantId,values.name]);
  await connection.execute("INSERT INTO restaurant_resources(id,tenant_id,kind,name,status,data) VALUES (?,?,'menu_category',?,'active',?)",[id,ctx.tenantId,values.name,JSON.stringify({nameEn:values.nameEn,nameFr:values.nameFr})]);
  await connection.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id) VALUES (?,?,'categories.save',?)",[ctx.tenantId,ctx.userId,id]);
  await connection.commit();
  return NextResponse.json({ok:true,category:{id,...values,enabled:true}},{status:201});
 }catch(e){await connection.rollback();return writeError(e)}
 finally{connection.release()}
}
export async function PATCH(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const ctx=await scope(request);if(ctx.error)return ctx.error;
 const body=await request.json().catch(()=>null) as CategoryInput|null;
 const values=names(body),id=typeof body?.id==="string"?body.id:"";
 if(!values||!/^[-0-9a-f]{36}$/i.test(id))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const connection=await database().getConnection();
 try{
  await connection.beginTransaction();
  const [rows]=await connection.execute<RowDataPacket[]>(
   "SELECT c.id,c.enabled,r.data AS metadata,r.archived FROM restaurant_menu_categories c LEFT JOIN restaurant_resources r ON r.id=c.id AND r.tenant_id=c.tenant_id AND r.kind='menu_category' WHERE c.tenant_id=? AND c.id=? LIMIT 1 FOR UPDATE",
   [ctx.tenantId,id]
  );
  if(!rows.length||rows[0].archived)throw new Error("CATEGORY_NOT_FOUND");
  await connection.execute("UPDATE restaurant_menu_categories SET name=? WHERE id=? AND tenant_id=?",[values.name,id,ctx.tenantId]);
  let imageUrl: string|null|undefined;
  if(body?.imageUrl!==undefined){
   if(body.imageUrl!==null&&(typeof body.imageUrl!=="string"||!/^\/api\/restaurant\/assets\/[a-f0-9-]{36}$/i.test(body.imageUrl))){await connection.rollback();return NextResponse.json({ok:false,code:"INVALID_IMAGE"},{status:400});}
   if(typeof body.imageUrl==="string"){
    const [found]=await connection.execute<RowDataPacket[]>("SELECT id FROM restaurant_assets WHERE tenant_id=? AND id=? LIMIT 1",[ctx.tenantId,body.imageUrl.split("/").at(-1)??""]);
    if(!found.length){await connection.rollback();return NextResponse.json({ok:false,code:"INVALID_IMAGE"},{status:400});}
   }
   imageUrl=body.imageUrl;
  }
  const data={...metadata(rows[0].metadata),nameEn:values.nameEn,nameFr:values.nameFr,...(imageUrl!==undefined?{imageUrl}:{} )};
  await connection.execute(
   "INSERT INTO restaurant_resources(id,tenant_id,kind,name,status,data) VALUES (?,?,'menu_category',?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),data=VALUES(data),version=version+1",
   [id,ctx.tenantId,values.name,rows[0].enabled?"active":"inactive",JSON.stringify(data)]
  );
  await connection.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id) VALUES (?,?,'categories.save',?)",[ctx.tenantId,ctx.userId,id]);
  await connection.commit();
  return NextResponse.json({ok:true,category:{id,...values,enabled:Boolean(rows[0].enabled)}});
 }catch(e){await connection.rollback();return writeError(e)}
 finally{connection.release()}
}
