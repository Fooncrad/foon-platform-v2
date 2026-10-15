import {NextResponse} from "next/server";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {database} from "@/lib/db/mysql";
import {CheckoutError} from "@/lib/payments/customer-checkout";
import {startServiceInvoiceSandboxCheckout} from "@/lib/payments/service-invoice-checkout";

export const runtime="nodejs";
const reply=(data:object,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 const user=await currentUserId();if(!user)return reply({ok:false,code:"UNAUTHENTICATED"},401);
 const tenantId=request.headers.get("x-foon-tenant")??"";
 if(!tenantId)return reply({ok:false,code:"TENANT_CONTEXT_REQUIRED"},400);
 try{await requireTenantMembership(user,tenantId,["owner","manager"],true);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 if(!(await tenantEntitlement(tenantId,"customer_invoices")).enabled)return reply({ok:false,code:"PLAN_FEATURE_REQUIRED"},403);
 const raw=await request.text();if(raw.length>1024)return reply({ok:false,code:"INVALID_INPUT"},400);
 let body:Record<string,unknown>;
 try{body=JSON.parse(raw);}catch{return reply({ok:false,code:"INVALID_INPUT"},400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["invoiceId","customerEmail","consentConfirmed"].includes(k))||typeof body.invoiceId!=="string"||!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(body.invoiceId)||typeof body.customerEmail!=="string"||body.consentConfirmed!==true)return reply({ok:false,code:"INVALID_INPUT"},400);
 try{
  const result=await startServiceInvoiceSandboxCheckout(database(),{tenantId,userId:user,invoiceId:body.invoiceId,customerEmail:body.customerEmail,appUrl:process.env.APP_URL??""});
  return reply({ok:true,...result},200);
 }catch(error){
  return reply({ok:false,code:error instanceof CheckoutError?error.message:"SERVICE_CHECKOUT_UNAVAILABLE"},error instanceof CheckoutError?error.status:503);
 }
}
