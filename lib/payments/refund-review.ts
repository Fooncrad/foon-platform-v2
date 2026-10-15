import {randomUUID} from "node:crypto";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {currencyDecimals} from "./webhook-verification.mjs";

export class RefundReviewError extends Error {
 constructor(public code:string,public status=409){super(code);}
}
const reject=(code:string,status=409):never=>{throw new RefundReviewError(code,status);};
function parse(raw:unknown):Record<string,unknown>{
 try{const v=typeof raw==="string"?JSON.parse(raw):raw;return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}catch{return {};}
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function moneyToMinor(value:unknown,decimals:number){
 const n=typeof value==="number"?value:typeof value==="string"&&value.trim()?Number(value):NaN;
 const factor=10**decimals;
 if(!Number.isFinite(n)||n<0||Math.abs(n*factor-Math.round(n*factor))>0.000001)return null;
 const minor=Math.round(n*factor);return Number.isSafeInteger(minor)?minor:null;
}

/** A merchant review case is not a provider refund and does not change a
 * paid invoice's financial state. Financial evidence stays immutable.
 * Tenant+invoice unique lookup prevents two simultaneous refund requests.
 */
export async function requestInvoiceRefundReview(db:PoolConnection,input:{
 tenantId:string;actor:string;invoiceId:string;reason:string;
}){
 if(!uuid.test(input.invoiceId))reject("INVALID_INPUT",400);
 const reason=input.reason.trim();
 if(reason.length<10||reason.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(reason))reject("REFUND_REASON_REQUIRED",400);
 const [invoiceRows]=await db.execute<RowDataPacket[]>("SELECT id,name,status,branch_id,data FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='customer_invoice' AND archived=FALSE FOR UPDATE",[input.tenantId,input.invoiceId]);
 const invoice=invoiceRows[0];
 if(!invoice)reject("INVOICE_NOT_FOUND",404);
 if(invoice.status!=="paid")reject("INVOICE_NOT_PAID");
 const [priorRows]=await db.execute<RowDataPacket[]>("SELECT id,data,status FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_refund_review' AND lookup_key=? LIMIT 1 FOR UPDATE",[input.tenantId,input.invoiceId]);
 if(priorRows.length){
  const previous=parse(priorRows[0].data);
  if(previous.reason===reason)return {id:String(priorRows[0].id),status:String(priorRows[0].status),existing:true};
  reject("REFUND_REVIEW_ALREADY_EXISTS");
 }
 const [proofRows]=await db.execute<RowDataPacket[]>("SELECT id,data FROM restaurant_resources WHERE tenant_id=? AND kind='invoice_settlement' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.invoiceId'))=? LIMIT 2 FOR UPDATE",[input.tenantId,input.invoiceId]);
 if(proofRows.length!==1)reject("PAYMENT_EVIDENCE_REQUIRED");
 const proof=parse(proofRows[0].data),details=parse(invoice.data);
 if(proof.invoiceId!==input.invoiceId)reject("PAYMENT_EVIDENCE_REQUIRED");
 const gateway=proof.source==="provider_verified_webhook";
 const manual=proof.source==="merchant_attested_manual";
 if(!gateway&&!manual)reject("PAYMENT_EVIDENCE_REQUIRED");
 const currency=gateway&&typeof proof.currency==="string"?proof.currency.toUpperCase():null;
 if(gateway&&(proof.mode!=="live"||!currency||!/^[A-Z]{3}$/.test(currency)))reject("PAYMENT_EVIDENCE_REQUIRED");
 let decimals=2;
 if(gateway){try{decimals=currencyDecimals(currency!);}catch{reject("PAYMENT_EVIDENCE_REQUIRED");}}
 const parts=[details.subtotal,details.taxAmount??0,details.serviceFee??0].map(v=>moneyToMinor(v,decimals));
 if(parts.some(v=>v===null))reject("REFUND_AMOUNT_INVALID");
 const amountMinor=parts.reduce<number>((sum,v)=>sum+(v??0),0);
 if(amountMinor<=0||!Number.isSafeInteger(amountMinor))reject("REFUND_AMOUNT_INVALID");
 if(gateway&&(proof.amountMinor!==amountMinor||typeof proof.provider!=="string"||typeof proof.providerPaymentId!=="string"))reject("REFUND_EVIDENCE_MISMATCH");
 if(manual&&(moneyToMinor(proof.amount,2)!==amountMinor||!["cash","bank_transfer"].includes(String(proof.method))))reject("REFUND_EVIDENCE_MISMATCH");
 const id=randomUUID(),data={
  invoiceId:input.invoiceId,settlementId:String(proofRows[0].id),reason,
  originalAmountMinor:amountMinor,currency,source:gateway?"gateway":"manual",
  provider:gateway?proof.provider:null,providerPaymentId:gateway?proof.providerPaymentId:null,
  requestedBy:input.actor,requestedAt:new Date().toISOString(),
  warning:"REVIEW_ONLY_NOT_REFUNDED"
 };
 await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data,lookup_key) VALUES (?,?,?,?,?,?,?,?)",[id,input.tenantId,invoice.branch_id,"invoice_refund_review","Refund review: "+String(invoice.name).slice(0,130),"review_pending",JSON.stringify(data),input.invoiceId]);
 await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?,?,?,?)",[input.tenantId,input.actor,"customer_invoice.refund_review_requested",input.invoiceId,JSON.stringify({reviewId:id,source:data.source,amountMinor,currency})]);
 return {id,status:"review_pending" as const,existing:false};
}
