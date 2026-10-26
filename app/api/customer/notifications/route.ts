import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";

export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
const fail=(code:string,status:number)=>NextResponse.json({ok:false,code},{status,headers});
const validId=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function POST(request:Request){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 try{assertSameOrigin(request);}catch{return fail("FORBIDDEN",403);}
 const user=await currentUserId();if(!user)return fail("UNAUTHENTICATED",401);
 let body:unknown;
 try{body=await readLimitedJson(request,1024);}
 catch(error){return error instanceof Error&&error.message==="BATCH_TOO_LARGE"?fail("BODY_TOO_LARGE",413):fail("INVALID_INPUT",400);}
 if(!body||typeof body!=="object"||Array.isArray(body))return fail("INVALID_INPUT",400);
 const payload=body as Record<string,unknown>;
 const keys=Object.keys(payload);
 const all=keys.length===1&&payload.all===true;
 const id=keys.length===1&&typeof payload.id==="string"&&validId.test(payload.id)?payload.id:null;
 if(!all&&!id)return fail("INVALID_INPUT",400);
 try{
  const db=database();
  const [accounts]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' LIMIT 1",[user]);
  if(!accounts.length)return fail("UNAUTHENTICATED",401);
  // The active-user predicate also protects against suspension between the read and the update.
  await db.execute("UPDATE customer_notifications SET read_at=COALESCE(read_at,NOW()) WHERE user_id=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND status='active')"+(all?"":" AND id=?"),all?[user,user]:[user,user,id]);
  return NextResponse.json({ok:true},{headers});
 }catch{return fail("NOTIFICATIONS_UNAVAILABLE",503);}
}
