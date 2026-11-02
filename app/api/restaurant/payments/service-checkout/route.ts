import {NextResponse} from "next/server";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {database} from "@/lib/db/mysql";
import {CheckoutError} from "@/lib/payments/customer-checkout";
import {startServiceInvoiceSandboxCheckout} from "@/lib/payments/service-invoice-checkout";
import {requireAdditionalBranchUnlock,BranchPinError} from "@/lib/restaurant/branch-pin";
import type {RowDataPacket} from "mysql2/promise";

export const runtime="nodejs";
const reply=(data:object,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 const user=await currentUserId();if(!user)return reply({ok:false,code:"UNAUTHENTICATED"},401);
 const tenantId=request.headers.get("x-foon-tenant")??"";
 if(!tenantId)return reply({ok:false,code:"TENANT_CONTEXT_REQUIRED"},400);
 try{await requireTenantMembership(user,tenantId,["owner","manager"],true);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 if(!(await tenantEntitlement(tenantId,"customer_invoices")).enabled)return reply({ok:false,code:"PLAN_FEATURE_REQUIRED"},403);
 let parsed:unknown;
 try{parsed=await readLimitedJson(request,1024);}catch(error){const tooLarge=error instanceof Error&&error.message==="BATCH_TOO_LARGE";return reply({ok:false,code:tooLarge?"BODY_TOO_LARGE":"INVALID_INPUT"},tooLarge?413:400);}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return reply({ok:false,code:"INVALID_INPUT"},400);
 const body=parsed as Record<string,unknown>;
 if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["invoiceId","customerEmail","consentConfirmed"].includes(k))||typeof body.invoiceId!=="string"||!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(body.invoiceId)||typeof body.customerEmail!=="string"||body.consentConfirmed!==true)return reply({ok:false,code:"INVALID_INPUT"},400);
 try{
  const [invoices]=await database().execute<RowDataPacket[]>("SELECT branch_id FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='customer_invoice' AND archived=FALSE LIMIT 1",[tenantId,body.invoiceId]);
  if(!invoices.length)return reply({ok:false,code:"INVOICE_NOT_FOUND"},404);
  await requireAdditionalBranchUnlock(tenantId,typeof invoices[0].branch_id==="string"?invoices[0].branch_id:null,user);
  const result=await startServiceInvoiceSandboxCheckout(database(),{tenantId,userId:user,invoiceId:body.invoiceId,customerEmail:body.customerEmail,appUrl:process.env.APP_URL??""});
  return reply({ok:true,...result},200);
 }catch(error){
  return reply({ok:false,code:error instanceof BranchPinError?error.code:error instanceof CheckoutError?error.message:"SERVICE_CHECKOUT_UNAVAILABLE"},error instanceof BranchPinError?403:error instanceof CheckoutError?error.status:503);
 }
}
