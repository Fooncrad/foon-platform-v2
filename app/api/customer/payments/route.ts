import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {NextResponse} from "next/server";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {CheckoutError,startCustomerPayment} from "@/lib/payments/customer-checkout";
export const runtime="nodejs";
export async function POST(request:Request){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 const reply=(body:object,status:number)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
 try{assertSameOrigin(request);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 const user=await currentUserId();if(!user)return reply({ok:false,code:"UNAUTHENTICATED"},401);
 let body: {orderId?:unknown}|null;
 try{body=await readLimitedJson(request,1024) as typeof body;}
 catch(error){return reply({ok:false,code:error instanceof Error&&error.message==="BATCH_TOO_LARGE"?"BODY_TOO_LARGE":"INVALID_INPUT"},error instanceof Error&&error.message==="BATCH_TOO_LARGE"?413:400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>k!=="orderId")||typeof body.orderId!=="string"||!/^[a-f0-9-]{36}$/i.test(body.orderId))return reply({ok:false,code:"INVALID_INPUT"},400);
 try{return reply({ok:true,...await startCustomerPayment(database(),{userId:user,orderId:body.orderId,appUrl:process.env.APP_URL??""})},200);}
 catch(error){return reply({ok:false,code:error instanceof CheckoutError?error.message:"CHECKOUT_UNAVAILABLE"},error instanceof CheckoutError?error.status:503);}
}
