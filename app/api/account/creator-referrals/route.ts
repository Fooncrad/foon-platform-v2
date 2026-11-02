import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {customerCreatorUserId} from "@/lib/creator/authorization";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function GET(){
 if(!await currentUserId())return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401,headers});
 const id=await customerCreatorUserId();
 if(!id)return NextResponse.json({ok:false,code:"CUSTOMER_ACCOUNT_REQUIRED"},{status:403,headers});
 try{
  const [[profile],[counts],[commissions],[settings]]=await Promise.all([
   database().execute<RowDataPacket[]>("SELECT handle FROM customer_creator_profiles WHERE user_id=? LIMIT 1",[id]),
   database().execute<RowDataPacket[]>("SELECT COUNT(*) AS total_referrals FROM customer_creator_referrals WHERE creator_user_id=?",[id]),
   database().execute<RowDataPacket[]>("SELECT c.id,t.name AS tenant_name,p.name_ar AS plan_name,c.billing_cycle,c.currency,CAST(c.base_amount AS CHAR) AS base_amount,c.commission_basis_points,CAST(c.amount AS CHAR) AS amount,c.status,c.created_at,c.paid_at FROM customer_creator_commissions c JOIN tenants t ON t.id=c.tenant_id JOIN package_plans p ON p.id=c.plan_id WHERE c.creator_user_id=? ORDER BY c.created_at DESC,c.id DESC LIMIT 100",[id]),
   database().execute<RowDataPacket[]>("SELECT enabled,commission_basis_points FROM platform_creator_referral_settings WHERE id=1")
  ]);
  if(!profile[0])return NextResponse.json({ok:true,profile:null,referrals:0,commissions:[]},{headers});
  return NextResponse.json({ok:true,profile:{handle:profile[0].handle},referrals:Number(counts[0]?.total_referrals??0),currentRate:Number(settings[0]?.enabled)?Number(settings[0]?.commission_basis_points)/100:0,referralsEnabled:Boolean(settings[0]?.enabled),commissions},{headers});
 }catch{return NextResponse.json({ok:false,code:"CREATOR_REFERRALS_UNAVAILABLE"},{status:503,headers});}
}
