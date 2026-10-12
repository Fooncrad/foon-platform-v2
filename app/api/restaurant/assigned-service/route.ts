import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
export const runtime="nodejs";
export async function GET(request:Request){
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const tenantId=new URL(request.url).searchParams.get("tenantId")??"";
 if(!/^[a-f0-9-]{36}$/i.test(tenantId))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{await requireTenantMembership(user,tenantId,["owner","manager","waiter","cashier","kitchen","driver","accountant"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 try{
  const db=database();
  const [employees]=await db.execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='employee' AND archived=FALSE AND (JSON_UNQUOTE(JSON_EXTRACT(data,'$.userId'))=? OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(data,'$.email')))=(SELECT LOWER(email) FROM users WHERE id=? LIMIT 1))",[tenantId,user,user]);
  if(!employees.length)return NextResponse.json({ok:true,tables:[],calls:[]});
  const employeeIds=employees.map(e=>String(e.id));
  const [tables]=await db.execute<RowDataPacket[]>("SELECT id,name,status,branch_id,data FROM restaurant_resources WHERE tenant_id=? AND kind='tables' AND archived=FALSE",[tenantId]);
  const mine=tables.filter(t=>employeeIds.includes(String(t.data?.waiterId??(typeof t.data==="string"?JSON.parse(t.data).waiterId:""))));
  const tableIds=new Set(mine.map(t=>String(t.id)));
  const [calls]=await db.execute<RowDataPacket[]>("SELECT id,name,status,branch_id,data FROM restaurant_resources WHERE tenant_id=? AND kind='waiterCalls' AND archived=FALSE AND status IN ('new','pending','requested','open')",[tenantId]);
  return NextResponse.json({ok:true,tables:mine.map(t=>({id:t.id,name:t.name,status:t.status,branchId:t.branch_id})),calls:calls.filter(c=>{const d=typeof c.data==="string"?JSON.parse(c.data):c.data;return tableIds.has(String(d?.tableId??""));}).map(c=>({id:c.id,name:c.name,status:c.status}))});
 }catch(error){console.error("[FOON assigned service]",error);return NextResponse.json({ok:false,code:"ASSIGNED_SERVICE_UNAVAILABLE"},{status:503});}
}
