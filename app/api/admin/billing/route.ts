import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
async function auth(write:boolean){const user=await currentActiveAdminUserId();if(!user)return {status:401,user:null};try{await requirePlatformRole(user,write?["super_admin","admin"]:["super_admin","admin","support"]);return {status:200,user};}catch{return {status:403,user:null};}}
export async function GET(){
 const a=await auth(false);if(a.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:a.status});
 try{const [requests]=await database().execute<RowDataPacket[]>("SELECT p.id,p.tenant_id,t.name AS tenant_name,p.plan_id,pl.name_ar AS plan_name,p.amount,p.currency,p.billing_cycle,p.transfer_reference,p.status,p.review_note,p.created_at FROM platform_payment_requests p JOIN tenants t ON t.id=p.tenant_id JOIN package_plans pl ON pl.id=p.plan_id ORDER BY p.created_at DESC LIMIT 200");return NextResponse.json({ok:true,requests});}
 catch{return NextResponse.json({ok:false,code:"BILLING_UNAVAILABLE"},{status:503});}
}
export async function PATCH(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const a=await auth(true);if(a.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:a.status});
 const b=await request.json().catch(()=>null);
 if(!b||typeof b.id!=="string"||!/^[a-f0-9-]{36}$/i.test(b.id)||!["approved","rejected"].includes(b.status)||typeof b.note!=="string"||b.note.length>500||(b.status==="rejected"&&!b.note.trim()))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{await db.beginTransaction();const [rows]=await db.execute<RowDataPacket[]>("SELECT id,status,tenant_id,plan_id,billing_cycle,amount,currency FROM platform_payment_requests WHERE id=? FOR UPDATE",[b.id]);if(!rows.length||rows[0].status!=="pending"){await db.rollback();return NextResponse.json({ok:false,code:"PAYMENT_NOT_PENDING"},{status:409});}
 if(b.status==="approved"){
 const payment=rows[0];
 const [prices]=await db.execute<RowDataPacket[]>("SELECT price FROM package_plan_prices WHERE plan_id=? AND billing_cycle=? AND currency=? AND enabled=TRUE LIMIT 1",[payment.plan_id,payment.billing_cycle,payment.currency]);
 if(!prices.length||Number(prices[0].price)!==Number(payment.amount)){await db.rollback();return NextResponse.json({ok:false,code:"PAYMENT_PRICE_MISMATCH"},{status:409});}
 const [plans]=await db.execute<RowDataPacket[]>("SELECT id FROM package_plans WHERE id=? AND enabled=TRUE",[payment.plan_id]);
 if(!plans.length){await db.rollback();return NextResponse.json({ok:false,code:"PLAN_NOT_AVAILABLE"},{status:409});}
 const [existing]=await db.execute<RowDataPacket[]>("SELECT id FROM tenant_subscriptions WHERE tenant_id=? FOR UPDATE",[payment.tenant_id]);
 const period=payment.billing_cycle==="yearly"?"INTERVAL 1 YEAR":"INTERVAL 1 MONTH";
 if(existing.length)await db.execute("UPDATE tenant_subscriptions SET plan_id=?,status='active',starts_at=NOW(),ends_at=DATE_ADD(NOW(),"+period+") WHERE tenant_id=?",[payment.plan_id,payment.tenant_id]);
 else await db.execute("INSERT INTO tenant_subscriptions(id,tenant_id,plan_id,status,starts_at,ends_at) VALUES (?,?,?,'active',NOW(),DATE_ADD(NOW(),"+period+"))",[randomUUID(),payment.tenant_id,payment.plan_id]);
 }
 await db.execute("UPDATE platform_payment_requests SET status=?,review_note=?,reviewed_by=?,reviewed_at=NOW() WHERE id=?",[b.status,b.note.trim(),a.user,b.id]);
 await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id) VALUES (?,?,?,?)",[a.user,"platform.payment."+b.status,"payment_request",b.id]);
 await db.commit();return NextResponse.json({ok:true});}
 catch{await db.rollback();return NextResponse.json({ok:false,code:"PAYMENT_REVIEW_FAILED"},{status:503});}finally{db.release();}
}
