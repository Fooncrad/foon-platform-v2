import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {assertSameOrigin} from "@/lib/security/origin";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
async function customer(){const denied=await employeePersonalAccessDenied();if(denied)return {denied};const id=await currentUserId();return {id};}
export async function GET(){
 const auth=await customer();if(auth.denied)return auth.denied;if(!auth.id)return NextResponse.json({ok:false,code:"LOGIN_REQUIRED"},{status:401,headers:noStore});
 const [rows]=await database().execute<RowDataPacket[]>(`SELECT f.tenant_id FROM customer_favorite_stores f JOIN tenants t ON t.id=f.tenant_id AND t.status='active' WHERE f.user_id=? ORDER BY f.created_at DESC LIMIT 100`,[auth.id]);
 return NextResponse.json({ok:true,tenantIds:rows.map(row=>String(row.tenant_id))},{headers:noStore});
}
async function change(request:Request,remove:boolean){
 const auth=await customer();if(auth.denied)return auth.denied;if(!auth.id)return NextResponse.json({ok:false,code:"LOGIN_REQUIRED"},{status:401,headers:noStore});
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"ORIGIN_REJECTED"},{status:403,headers:noStore});}
 const data=await request.json().catch(()=>null);
 const tenantId=data?.tenantId;
 if(typeof tenantId!=="string"||!/^[a-f0-9-]{36}$/i.test(tenantId))return NextResponse.json({ok:false,code:"INVALID_TENANT"},{status:400,headers:noStore});
 try{
  if(remove){
   await database().execute("DELETE FROM customer_favorite_stores WHERE user_id=? AND tenant_id=?",[auth.id,tenantId]);
   return NextResponse.json({ok:true},{headers:noStore});
  }
  // Never accept arbitrary or inactive shops as customer favorites.
  const [linked]=await database().execute<RowDataPacket[]>(
   "SELECT t.id FROM tenant_customers tc JOIN tenants t ON t.id=tc.tenant_id AND t.status='active' WHERE tc.user_id=? AND tc.tenant_id=? LIMIT 1",
   [auth.id,tenantId]
  );
  if(!linked.length)return NextResponse.json({ok:false,code:"STORE_NOT_LINKED"},{status:404,headers:noStore});
  // An existing favorite remains successful even at the account's 100-store limit.
  const [existing]=await database().execute<RowDataPacket[]>(
   "SELECT tenant_id FROM customer_favorite_stores WHERE user_id=? AND tenant_id=? LIMIT 1",[auth.id,tenantId]
  );
  if(existing.length)return NextResponse.json({ok:true},{headers:noStore});
  await database().execute(`INSERT IGNORE INTO customer_favorite_stores(user_id,tenant_id)
 SELECT ?,t.id FROM tenants t JOIN tenant_customers tc ON tc.tenant_id=t.id AND tc.user_id=?
 WHERE t.id=? AND t.status='active'
 AND (SELECT COUNT(*) FROM customer_favorite_stores WHERE user_id=?)<100`,[auth.id,auth.id,tenantId,auth.id]);
  // INSERT IGNORE may do nothing when capacity is exhausted or membership changed.
  const [saved]=await database().execute<RowDataPacket[]>(
   "SELECT tenant_id FROM customer_favorite_stores WHERE user_id=? AND tenant_id=? LIMIT 1",[auth.id,tenantId]
  );
  if(!saved.length)return NextResponse.json({ok:false,code:"FAVORITES_LIMIT_OR_UNAVAILABLE"},{status:409,headers:noStore});
  return NextResponse.json({ok:true},{headers:noStore});
 }catch{
  return NextResponse.json({ok:false,code:"FAVORITES_UNAVAILABLE"},{status:503,headers:noStore});
 }
}
export async function POST(request:Request){return change(request,false);}
export async function DELETE(request:Request){return change(request,true);}
