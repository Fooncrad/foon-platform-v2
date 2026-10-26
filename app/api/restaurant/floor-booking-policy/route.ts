import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {defaultFloorBookingPolicy,parseFloorBookingPolicy} from "@/lib/restaurant/floor-booking-policy";
async function authorize(req:Request,write:boolean){
 const user=await currentUserId();if(!user)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=req.headers.get("x-foon-tenant"),branch=new URL(req.url).searchParams.get("branch");
 if(!tenant||!branch)return {error:NextResponse.json({ok:false,code:"BRANCH_REQUIRED"},{status:400})};
 try{const member=await requireTenantMembership(user,tenant,["owner","manager"],write);
 if(write)await requireAllAdditionalBranchesUnlocked(member.tenantId,user);
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id FROM branches WHERE tenant_id=? AND id=? AND enabled=TRUE LIMIT 1",[member.tenantId,branch]);
 if(!rows.length)return {error:NextResponse.json({ok:false,code:"BRANCH_NOT_FOUND"},{status:404})};
 return {tenant:member.tenantId,branch};
 }catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}}
}
export async function GET(req:Request){const a=await authorize(req,false);if(a.error)return a.error;try{const [r]=await database().execute<RowDataPacket[]>("SELECT enabled,booking_fee,session_minutes,order_policy,refund_policy FROM restaurant_floor_booking_policies WHERE tenant_id=? AND branch_id=? LIMIT 1",[a.tenant,a.branch]);const v=r[0];return NextResponse.json({ok:true,settings:v?{enabled:Boolean(v.enabled),bookingFee:Number(v.booking_fee),sessionMinutes:Number(v.session_minutes),orderPolicy:String(v.order_policy),refundPolicy:String(v.refund_policy)}:defaultFloorBookingPolicy},{headers:{"Cache-Control":"no-store"}})}catch{return NextResponse.json({ok:false,code:"POLICY_UNAVAILABLE"},{status:503})}}
export async function PUT(req:Request){try{assertSameOrigin(req)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}const a=await authorize(req,true);if(a.error)return a.error;let raw:unknown;try{raw=await readLimitedJson(req,4096)}catch(error){const code=error instanceof Error?error.message:"INVALID_INPUT";return NextResponse.json({ok:false,code:code==="BATCH_TOO_LARGE"?"BODY_TOO_LARGE":"INVALID_INPUT"},{status:code==="BATCH_TOO_LARGE"?413:400})}const input=raw&&typeof raw==="object"&&"settings" in raw?raw.settings:null;const policy=parseFloorBookingPolicy(input);if(!policy)return NextResponse.json({ok:false,code:"INVALID_POLICY"},{status:400});
 // Fail closed: payment intent/settlement and floor-to-real-table linking must be completed before activating a paid customer booking mode.
 if(policy.enabled)return NextResponse.json({ok:false,code:"PAYMENT_SETTLEMENT_INTEGRATION_REQUIRED"},{status:409});
 try{await database().execute("INSERT INTO restaurant_floor_booking_policies(tenant_id,branch_id,enabled,booking_fee,session_minutes,order_policy,refund_policy) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),booking_fee=VALUES(booking_fee),session_minutes=VALUES(session_minutes),order_policy=VALUES(order_policy),refund_policy=VALUES(refund_policy)",[a.tenant,a.branch,false,policy.bookingFee,policy.sessionMinutes,policy.orderPolicy,policy.refundPolicy]);return NextResponse.json({ok:true})}catch{return NextResponse.json({ok:false,code:"POLICY_SAVE_FAILED"},{status:503})}}
