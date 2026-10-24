import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import type {ResultSetHeader,RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {assertSameOrigin} from "@/lib/security/origin";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const cache={"Cache-Control":"no-store, private"};
const identifier=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:cache});
async function guard(){
 const denied=await employeePersonalAccessDenied();
 if(denied)return {error:denied};
 const id=await currentUserId();
 if(!id)return {error:response({ok:false,code:"UNAUTHENTICATED"},401)};
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' LIMIT 1",[id]);
 if(!rows.length)return {error:response({ok:false,code:"UNAUTHENTICATED"},401)};
 return {id};
}
export async function GET(){
 try{
  const ctx=await guard();if(ctx.error)return ctx.error;
  const [rows]=await database().execute<RowDataPacket[]>(
   "SELECT f.tenant_id FROM customer_favorite_stores f JOIN tenant_customers c ON c.tenant_id=f.tenant_id AND c.user_id=f.user_id JOIN tenants t ON t.id=f.tenant_id AND t.status='active' WHERE f.user_id=? ORDER BY f.created_at DESC LIMIT 100",
   [ctx.id]
  );
  return response({ok:true,storeIds:rows.map(row=>String(row.tenant_id))});
 }catch{return response({ok:false,code:"FAVORITES_UNAVAILABLE"},503);}
}
async function change(request:Request,remove:boolean){
 try{assertSameOrigin(request);}catch{return response({ok:false,code:"FORBIDDEN"},403);}
 try{
  const ctx=await guard();if(ctx.error)return ctx.error;
  const body=await request.json().catch(()=>null);
  const storeId=typeof body?.storeId==="string"?body.storeId:"";
  if(!identifier.test(storeId))return response({ok:false,code:"INVALID_INPUT"},400);
  if(remove){
   const [result]=await database().execute<ResultSetHeader>("DELETE FROM customer_favorite_stores WHERE user_id=? AND tenant_id=?",[ctx.id,storeId]);
   return response({ok:true,saved:false,changed:result.affectedRows>0});
  }
  const [joined]=await database().execute<RowDataPacket[]>(
   "SELECT c.tenant_id FROM tenant_customers c JOIN tenants t ON t.id=c.tenant_id AND t.status='active' WHERE c.user_id=? AND c.tenant_id=? LIMIT 1",[ctx.id,storeId]
  );
  if(!joined.length)return response({ok:false,code:"STORE_NOT_LINKED"},404);
  await database().execute("INSERT IGNORE INTO customer_favorite_stores(user_id,tenant_id) VALUES (?,?)",[ctx.id,storeId]);
  return response({ok:true,saved:true});
 }catch{return response({ok:false,code:"FAVORITES_UNAVAILABLE"},503);}
}
export async function POST(request:Request){return change(request,false);}
export async function DELETE(request:Request){return change(request,true);}
