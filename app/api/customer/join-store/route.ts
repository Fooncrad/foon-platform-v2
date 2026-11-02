import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {assertSameOrigin} from "@/lib/security/origin";
import {validStoreSlug} from "@/scripts/store-slug.mjs";
import {activeCustomerAccount} from "@/lib/auth/active-customer-account.mjs";
import {tenantPublicControls} from "@/lib/tenant/public-controls";
export const runtime="nodejs";
export async function POST(request:Request){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const userId=await currentUserId();
 if(!userId)return NextResponse.json({ok:false,code:"UNAUTHORIZED"},{status:401});
 const body=await request.json().catch(()=>null);
 const slug=typeof body?.storeSlug==="string"?body.storeSlug.trim().toLowerCase():"";
 if(!validStoreSlug(slug))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const connection=await database().getConnection();
 try{
  await connection.beginTransaction();
  // Lock the account while creating tenant links: a suspended session cannot join a store.
  if(!await activeCustomerAccount(connection,userId,true)){
   await connection.rollback();
   return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401,headers:{"Cache-Control":"no-store"}});
  }
  const [stores]=await connection.execute<RowDataPacket[]>("SELECT id FROM tenants WHERE slug=? AND status='active' LIMIT 1",[slug]);
  if(!stores.length){await connection.rollback();return NextResponse.json({ok:false,code:"STORE_NOT_FOUND"},{status:404})}
  const tenantId=String(stores[0].id);
  if(!(await tenantPublicControls(tenantId,connection)).customerLogin){await connection.rollback();return NextResponse.json({ok:false,code:"PUBLIC_FEATURE_DISABLED"},{status:403})}
  await connection.execute("INSERT IGNORE INTO tenant_customers(tenant_id,user_id) VALUES (?,?)",[tenantId,userId]);
  await connection.execute("INSERT IGNORE INTO customer_origins(user_id,tenant_id) VALUES (?,?)",[userId,tenantId]);
  await connection.commit();
  return NextResponse.json({ok:true});
 }catch{await connection.rollback();return NextResponse.json({ok:false,code:"JOIN_STORE_UNAVAILABLE"},{status:503})}
 finally{connection.release()}
}
