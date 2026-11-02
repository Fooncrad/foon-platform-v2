import {dispatchNotifications} from "@/lib/notifications/dispatch";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {decryptPaymentCredentials} from "@/lib/payments/credential-vault.mjs";
import {verifyPaymentWebhook,WebhookError} from "@/lib/payments/webhook-verification.mjs";
import {persistPaymentWebhook} from "@/lib/payments/webhook-settlement";
export const runtime="nodejs";
async function readLimited(request:Request){
 const reader=request.body?.getReader();if(!reader)return "";
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>131072){await reader.cancel();throw Error("BODY_TOO_LARGE");}chunks.push(part.value);}return Buffer.concat(chunks).toString("utf8");}finally{reader.releaseLock();}
}
export async function POST(request:Request,{params}:{params:Promise<{endpoint:string}>}){
 const {endpoint}=await params;if(!/^[a-f0-9]{48}$/.test(endpoint))return NextResponse.json({ok:false},{status:404});
 let raw;try{raw=await readLimited(request);}catch{return NextResponse.json({ok:false,code:"BODY_TOO_LARGE"},{status:413});}
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  // Serialize receipts per endpoint and prevent a settings change from racing verification.
  const [rows]=await db.execute<RowDataPacket[]>("SELECT e.tenant_id,e.scope_key,e.endpoint_id,e.provider,e.mode,g.credentials_ciphertext,s.merchant_reference FROM tenant_payment_webhook_endpoints e JOIN tenant_payment_gateway_credentials g ON g.tenant_id=e.tenant_id AND g.scope_key=e.scope_key AND g.provider=e.provider AND g.mode=e.mode JOIN tenant_payment_settings s ON s.tenant_id=e.tenant_id AND s.scope_key=e.scope_key JOIN tenants t ON t.id=e.tenant_id AND t.status='active' WHERE e.endpoint_id=? FOR UPDATE",[endpoint]);
  const row=rows[0];if(!row){await db.rollback();return NextResponse.json({ok:false},{status:404});}
  if(!row.credentials_ciphertext){await db.rollback();return NextResponse.json({ok:false,code:"WEBHOOK_NOT_CONFIGURED"},{status:503});}
  const credentials=decryptPaymentCredentials(String(row.credentials_ciphertext),{tenantId:String(row.tenant_id),scope:String(row.scope_key),provider:String(row.provider),mode:row.mode});
  const event=verifyPaymentWebhook({provider:String(row.provider),mode:String(row.mode),raw,headers:request.headers,credentials,merchantReference:row.merchant_reference});
  await persistPaymentWebhook(db,{tenant_id:String(row.tenant_id),scope_key:String(row.scope_key),endpoint_id:endpoint,provider:String(row.provider),mode:String(row.mode)},event);
  await db.commit();dispatchNotifications();
  // Acknowledge only durable authenticated receipts. Do not expose order or tenant information.
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  await db.rollback();
  if(error instanceof WebhookError)return NextResponse.json({ok:false,code:error.message},{status:error.message==="WEBHOOK_NOT_CONFIGURED"?503:400});
  return NextResponse.json({ok:false,code:"WEBHOOK_UNAVAILABLE"},{status:503});
 }finally{db.release();}
}
