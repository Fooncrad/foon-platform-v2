import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import {RefundReviewError,requestInvoiceRefundReview,decideInvoiceRefundReview} from "@/lib/payments/refund-review";
import {requireAdditionalBranchUnlock,onlyUnlockedBranchRows,BranchPinError} from "@/lib/restaurant/branch-pin";

export const runtime="nodejs";
const response=(payload:object,status=200)=>NextResponse.json(payload,{status,headers:{"Cache-Control":"no-store"}});
async function access(request:Request,decision=false){
 const user=await currentUserId();if(!user)throw new RefundReviewError("UNAUTHENTICATED",401);
 const tenant=request.headers.get("x-foon-tenant")??"";
 if(!tenant)throw new RefundReviewError("TENANT_CONTEXT_REQUIRED",400);
 let membership;try{membership=await requireTenantMembership(user,tenant,decision?["owner"]:["owner","manager"],true);}catch{throw new RefundReviewError("FORBIDDEN",403);}
 if(!(await tenantEntitlement(tenant,"customer_invoices")).enabled)throw new RefundReviewError("PLAN_FEATURE_REQUIRED",403);
 return {tenant,user,role:membership.role};
}
const fail=(error:unknown)=>response({ok:false,code:error instanceof BranchPinError?error.code:error instanceof RefundReviewError?error.code:"REFUND_REVIEW_UNAVAILABLE"},error instanceof BranchPinError?403:error instanceof RefundReviewError?error.status:503);

export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return response({ok:false,code:"FORBIDDEN"},403);}
 let scope;try{scope=await access(request);}catch(error){return fail(error);}
 const raw=await request.text();if(raw.length>2048)return response({ok:false,code:"INVALID_INPUT"},400);
 let body:unknown;try{body=JSON.parse(raw);}catch{return response({ok:false,code:"INVALID_INPUT"},400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["invoiceId","reason","reviewAcknowledged"].includes(k)))return response({ok:false,code:"INVALID_INPUT"},400);
 const input=body as Record<string,unknown>;
 if(typeof input.invoiceId!=="string"||typeof input.reason!=="string"||input.reviewAcknowledged!==true)return response({ok:false,code:"INVALID_INPUT"},400);
 try{
  const [matched]=await database().execute<RowDataPacket[]>("SELECT branch_id FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='customer_invoice' AND archived=FALSE LIMIT 1",[scope.tenant,input.invoiceId]);
  if(!matched.length)return response({ok:false,code:"INVOICE_NOT_FOUND"},404);
  await requireAdditionalBranchUnlock(scope.tenant,typeof matched[0].branch_id==="string"?matched[0].branch_id:null,scope.user);
 }catch(error){return fail(error);}
 const db=await database().getConnection();
 try{
  await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
  await db.beginTransaction();
  const result=await requestInvoiceRefundReview(db,{tenantId:scope.tenant,actor:scope.user,invoiceId:input.invoiceId,reason:input.reason});
  await db.commit();
  return response({ok:true,...result,financialEffect:"none"},result.existing?200:201);
 }catch(error){await db.rollback();return fail(error);}finally{db.release();}
}
/** This is a two-person *review* decision, not a provider refund. */
export async function PATCH(request:Request){
 try{assertSameOrigin(request);}catch{return response({ok:false,code:"FORBIDDEN"},403);}
 let scope;try{scope=await access(request,true);}catch(error){return fail(error);}
 const raw=await request.text();if(raw.length>2048)return response({ok:false,code:"INVALID_INPUT"},400);
 let body:unknown;try{body=JSON.parse(raw);}catch{return response({ok:false,code:"INVALID_INPUT"},400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["reviewId","decision","note","acknowledgeNoRefund"].includes(k)))return response({ok:false,code:"INVALID_INPUT"},400);
 const payload=body as Record<string,unknown>;
 if(typeof payload.reviewId!=="string"||!["approve","reject"].includes(String(payload.decision))||typeof payload.note!=="string"||payload.acknowledgeNoRefund!==true)return response({ok:false,code:"INVALID_INPUT"},400);
 try{
  const [matched]=await database().execute<RowDataPacket[]>("SELECT branch_id FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='invoice_refund_review' AND archived=FALSE LIMIT 1",[scope.tenant,payload.reviewId]);
  if(!matched.length)return response({ok:false,code:"REFUND_REVIEW_NOT_FOUND"},404);
  await requireAdditionalBranchUnlock(scope.tenant,typeof matched[0].branch_id==="string"?matched[0].branch_id:null,scope.user);
 }catch(error){return fail(error);}
 const db=await database().getConnection();
 try{
  await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
  await db.beginTransaction();
  const result=await decideInvoiceRefundReview(db,{tenantId:scope.tenant,actor:scope.user,reviewId:payload.reviewId,decision:payload.decision as "approve"|"reject",note:payload.note});
  await db.commit();
  return response({ok:true,...result,financialEffect:"none"},200);
 }catch(error){await db.rollback();return fail(error);}finally{db.release();}
}
export async function GET(request:Request){
 let scope;try{scope=await access(request);}catch(error){return fail(error);}
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT id,branch_id,status,data,created_at FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_refund_review' AND archived=FALSE ORDER BY created_at DESC LIMIT 200",[scope.tenant]);
  const unlocked=await onlyUnlockedBranchRows(scope.tenant,scope.user,rows);
  return response({ok:true,reviews:unlocked.map(row=>{
   const proof=typeof row.data==="string"?JSON.parse(row.data):row.data;
   return {id:row.id,invoiceId:proof.invoiceId,branchId:row.branch_id,status:row.status,reason:proof.reason,source:proof.source,originalAmountMinor:proof.originalAmountMinor,currency:proof.currency,createdAt:row.created_at,decisionNote:proof.decisionNote??null,canDecide:scope.role==="owner"&&row.status==="review_pending"&&proof.requestedBy!==scope.user};
  })});
 }catch{return response({ok:false,code:"REFUND_REVIEW_UNAVAILABLE"},503);}
}
