import {NextResponse} from "next/server";
import {currentUserId,currentSessionId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import {matchesBranchPin,validBranchPin} from "@/lib/restaurant/branch-pin";
import type {RowDataPacket} from "mysql2/promise";

export const runtime="nodejs";
function fail(code:string,status:number){return NextResponse.json({ok:false,code},{status,headers:{"Cache-Control":"no-store"}});}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return fail("FORBIDDEN",403);}
 const user=await currentUserId(),session=await currentSessionId();
 if(!user||!session)return fail("UNAUTHENTICATED",401);
 const body=await request.json().catch(()=>null);
 const tenantId=body?.tenantId,branchId=body?.branchId,pin=body?.pin;
 if(typeof tenantId!=="string"||typeof branchId!=="string"||!validBranchPin(pin))return fail("INVALID_INPUT",400);
 let membership;
 try{membership=await requireTenantMembership(user,tenantId,["owner","manager","cashier","waiter","kitchen","driver","accountant"]);}catch{return fail("FORBIDDEN",403);}
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [branches]=await db.execute<RowDataPacket[]>("SELECT id,pin_salt,pin_hash FROM branches WHERE tenant_id=? ORDER BY created_at,id",[membership.tenantId]);
  const pos=branches.findIndex(b=>String(b.id)===branchId);
  if(pos<0){await db.rollback();return fail("BRANCH_NOT_FOUND",404);}
  if(pos===0){await db.rollback();return NextResponse.json({ok:true,primary:true});}
  if(!["owner","manager"].includes(membership.role)){
   const [assigned]=await db.execute<RowDataPacket[]>("SELECT 1 FROM employee_branch_assignments WHERE tenant_id=? AND branch_id=? AND user_id=? AND enabled=TRUE LIMIT 1",[tenantId,branchId,user]);
   if(!assigned.length){await db.rollback();return fail("FORBIDDEN",403);}
  }
  const selected=branches[pos];
  if(!selected.pin_hash||!selected.pin_salt){await db.rollback();return fail("BRANCH_PIN_SETUP_REQUIRED",409);}
  await db.execute("INSERT INTO branch_pin_access(auth_session_id,tenant_id,branch_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE updated_at=UTC_TIMESTAMP()",[session,tenantId,branchId]);
  const [rows]=await db.execute<RowDataPacket[]>("SELECT attempts,blocked_until FROM branch_pin_access WHERE auth_session_id=? AND branch_id=? FOR UPDATE",[session,branchId]);
  const attempt=rows[0],blocked=attempt?.blocked_until?new Date(attempt.blocked_until).getTime():0;
  if(blocked>Date.now()){await db.rollback();return fail("BRANCH_PIN_LOCKED",429);}
  if(!matchesBranchPin(pin,String(selected.pin_salt),String(selected.pin_hash))){
   const next=Number(attempt.attempts)+1;
   await db.execute("UPDATE branch_pin_access SET attempts=?,blocked_until=?,unlocked_until=NULL WHERE auth_session_id=? AND branch_id=?",[next>=5?0:next,next>=5?new Date(Date.now()+15*60*1000):null,session,branchId]);
   await db.commit();return fail(next>=5?"BRANCH_PIN_LOCKED":"BRANCH_PIN_INVALID",next>=5?429:403);
  }
  await db.execute("UPDATE branch_pin_access SET attempts=0,blocked_until=NULL,unlocked_until=? WHERE auth_session_id=? AND branch_id=?",[new Date(Date.now()+15*60*1000),session,branchId]);
  await db.commit();
  return NextResponse.json({ok:true,expiresInSeconds:900},{headers:{"Cache-Control":"no-store"}});
 }catch{await db.rollback().catch(()=>{});return fail("BRANCH_PIN_UNAVAILABLE",503);}finally{db.release();}
}
