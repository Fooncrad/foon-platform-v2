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
 if(remove)await database().execute("DELETE FROM customer_favorite_stores WHERE user_id=? AND tenant_id=?",[auth.id,tenantId]);
 else {
  // Only already-linked customer stores are eligible; no tenant membership or roles are changed.
  await database().execute(`INSERT IGNORE INTO customer_favorite_stores(user_id,tenant_id)
 SELECT ?,t.id FROM tenants t JOIN tenant_customers tc ON tc.tenant_id=t.id AND tc.user_id=?
 WHERE t.id=? AND t.status='active'
 AND (SELECT COUNT(*) FROM customer_favorite_stores WHERE user_id=?)<100`,[auth.id,auth.id,tenantId,auth.id]);
 }
 return NextResponse.json({ok:true},{headers:noStore});
}
export async function POST(request:Request){return change(request,false);}
export async function DELETE(request:Request){return change(request,true);}
