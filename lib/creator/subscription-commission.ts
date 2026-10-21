import {queueCommissionNotice} from "./commission-notices";
import {randomUUID} from "node:crypto";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {validCreatorHandle} from "./profile-policy.ts";

export function commissionAmount(base:string,rateBasisPoints:number):string{
 if(!/^(0|[1-9][0-9]{0,9})\.[0-9]{2}$/.test(base)||!Number.isSafeInteger(rateBasisPoints)||rateBasisPoints<0||rateBasisPoints>10000)throw Error("COMMISSION_INPUT_INVALID");
 const [major,minor]=base.split(".");
 const cents=BigInt(major)*100n+BigInt(minor);
 const rounded=(cents*BigInt(rateBasisPoints)+5000n)/10000n; // half up, integer cents
 return String(rounded/100n)+"."+String(rounded%100n).padStart(2,"0");
}
export function percentToBasisPoints(value:unknown):number|null{
 if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>100)return null;
 const basis=Math.round(value*100);
 return Math.abs(value*100-basis)<1e-8?basis:null;
}
export async function recordCreatorReferral(db:PoolConnection,tenantId:string,ownerId:string,rawHandle:unknown){
 if(rawHandle===undefined||rawHandle===null||rawHandle==="")return;
 if(typeof rawHandle!=="string"||!validCreatorHandle(rawHandle.trim().toLowerCase()))throw Error("REFERRAL_INVALID");
 const handle=rawHandle.trim().toLowerCase();
 const [rows]=await db.execute<RowDataPacket[]>(
  "SELECT p.user_id FROM customer_creator_profiles p "+
  "JOIN users u ON u.id=p.user_id AND u.status='active' "+
  "WHERE p.handle=? AND p.user_id<>? "+
  "AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=p.user_id) "+
  "AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=p.user_id) LIMIT 1",
  [handle,ownerId]);
 if(!rows.length)throw Error("REFERRAL_INVALID");
 await db.execute(
  "INSERT INTO customer_creator_referrals(tenant_id,creator_user_id,referral_handle) VALUES (?,?,?)",
  [tenantId,rows[0].user_id,handle]);
}
/** Invoked INSIDE the same locked, committed transaction as approving a paid platform request. */
export async function creditApprovedSubscription(db:PoolConnection,payment:{id:string;tenant_id:string;plan_id:string;billing_cycle:string;amount:string|number;currency:string}){
 if(!["monthly","yearly"].includes(payment.billing_cycle))throw Error("INVALID_BILLING_CYCLE");
 const [rows]=await db.execute<RowDataPacket[]>(
  "SELECT r.creator_user_id,s.enabled,s.commission_basis_points FROM customer_creator_referrals r "+
  "JOIN customer_creator_profiles p ON p.user_id=r.creator_user_id "+
  "JOIN users u ON u.id=r.creator_user_id AND u.status='active' "+
  "JOIN platform_creator_referral_settings s ON s.id=1 "+
  "WHERE r.tenant_id=? AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=r.creator_user_id) "+
  "AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=r.creator_user_id) LIMIT 1",
  [payment.tenant_id]);
 const cfg=rows[0];if(!cfg||!Number(cfg.enabled)||!Number(cfg.commission_basis_points))return;
 const rate=Number(cfg.commission_basis_points);
 const base=String(payment.amount);
 const amount=commissionAmount(base,rate);
 if(amount==="0.00")return;
 const commissionId=randomUUID();
 await db.execute(
  "INSERT INTO customer_creator_commissions(id,payment_request_id,tenant_id,creator_user_id,plan_id,billing_cycle,currency,base_amount,commission_basis_points,amount,status) "+
  "VALUES (?,?,?,?,?,?,?,?,?,?,'earned')",
  [commissionId,payment.id,payment.tenant_id,cfg.creator_user_id,payment.plan_id,payment.billing_cycle,payment.currency,base,rate,amount]);
 await queueCommissionNotice(db,commissionId,"earned");
}
