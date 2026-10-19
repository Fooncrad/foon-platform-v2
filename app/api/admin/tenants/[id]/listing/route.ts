import {NextResponse} from "next/server";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import type {RowDataPacket} from "mysql2/promise";

function dateValue(value:unknown):string|null|undefined{
 if(value===null||value==="")return null;
 if(typeof value!=="string"||!/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.test(value))return undefined;
 const date=new Date(value+":00Z");if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,16)!==value)return undefined;
 return date.toISOString().slice(0,19).replace("T"," ");
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentActiveAdminUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(actor,["super_admin","admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const body=await request.json().catch(()=>null),{id}=await params;
 if(!body||typeof body!=="object"||Array.isArray(body)||typeof body.enabled!=="boolean"||!Number.isInteger(body.sortOrder)||body.sortOrder < -100000||body.sortOrder>100000)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const from=dateValue(body.visibleFrom),until=dateValue(body.visibleUntil);
 if(from===undefined||until===undefined||from&&until&&from>=until)return NextResponse.json({ok:false,code:"INVALID_SCHEDULE"},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [rows]=await db.execute<RowDataPacket[]>("SELECT market_enabled,market_visible_from,market_visible_until,market_sort_order FROM tenants WHERE id=? FOR UPDATE",[id]);
  if(!rows.length){await db.rollback();return NextResponse.json({ok:false,code:"TENANT_NOT_FOUND"},{status:404});}
  await db.execute("UPDATE tenants SET market_enabled=?,market_visible_from=?,market_visible_until=?,market_sort_order=? WHERE id=?",[body.enabled,from,until,body.sortOrder,id]);
  await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,?,?,?,?)",[actor,"tenant.market_listing","tenant",id,JSON.stringify({previous:{enabled:Boolean(rows[0].market_enabled),visibleFrom:rows[0].market_visible_from,visibleUntil:rows[0].market_visible_until,sortOrder:Number(rows[0].market_sort_order)},next:{enabled:body.enabled,visibleFrom:from,visibleUntil:until,sortOrder:body.sortOrder}})]);
  await db.commit();return NextResponse.json({ok:true,enabled:body.enabled,visibleFrom:from,visibleUntil:until,sortOrder:body.sortOrder});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"MARKET_LISTING_SAVE_FAILED"},{status:503});}finally{db.release();}
}
