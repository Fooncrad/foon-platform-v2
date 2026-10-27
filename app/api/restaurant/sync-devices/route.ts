import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {authorizeCurrentSyncDeviceAdmin} from "@/lib/platform/bidirectional-sync-admin-session";
import {enrollSyncDevice,revokeSyncDevice} from "@/lib/platform/bidirectional-sync-device-enrollment.mjs";
export const runtime="nodejs";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function permitted(request:Request){
 if(process.env.FOON_SYNC_DEVICE_ENROLLMENT_ENABLED!=="true")return NextResponse.json({ok:false,code:"FEATURE_DISABLED"},{status:404});
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 return null;
}
function scopeOf(value:unknown){
 if(!value||typeof value!=="object")return null;
 const v=value as Record<string,unknown>;
 if(typeof v.tenantId!=="string"||typeof v.branchId!=="string"||!uuid.test(v.tenantId)||!uuid.test(v.branchId))return null;
 return {tenantId:v.tenantId,branchId:v.branchId};
}
export async function POST(request:Request){
 const blocked=permitted(request);if(blocked)return blocked;
 const input=await request.json().catch(()=>null);const scope=scopeOf(input);
 if(!scope)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const body=input as Record<string,unknown>;
 if(!Array.isArray(body.grants)||typeof body.expiresAt!=="string")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const conn=await database().getConnection();
 try{
  const result=await enrollSyncDevice({db:conn,session:null,authorizeAdmin:async()=>{const admin=await authorizeCurrentSyncDeviceAdmin(null,scope);return {...admin,verifiedServerSide:true as const}},grants:body.grants,expiresAt:body.expiresAt});
  return NextResponse.json({ok:true,device:result},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  const code=error instanceof Error?error.message:"";
  return NextResponse.json({ok:false,code:code==="SYNC_INVALID_ENROLLMENT"||code==="SYNC_INVALID_EXPIRY"?"INVALID_INPUT":"FORBIDDEN"},{status:code==="SYNC_INVALID_ENROLLMENT"||code==="SYNC_INVALID_EXPIRY"?400:403});
 }finally{conn.release()}
}
export async function DELETE(request:Request){
 const blocked=permitted(request);if(blocked)return blocked;
 const input=await request.json().catch(()=>null);const scope=scopeOf(input);
 if(!scope||typeof (input as Record<string,unknown>).deviceId!=="string"||!uuid.test((input as Record<string,string>).deviceId))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const conn=await database().getConnection();
 try{
  const result=await revokeSyncDevice({db:conn,session:null,authorizeAdmin:async()=>{const admin=await authorizeCurrentSyncDeviceAdmin(null,scope);return {...admin,verifiedServerSide:true as const}},deviceId:(input as Record<string,string>).deviceId});
  return NextResponse.json({ok:true,...result},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}finally{conn.release()}
}
