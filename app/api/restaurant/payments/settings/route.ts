import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {isPaymentProvider,paymentMissingFields,validatePaymentKeys} from "@/lib/payments/provider-catalog";
import {decryptPaymentCredentials,encryptPaymentCredentials,paymentVaultReady} from "@/lib/payments/credential-vault.mjs";

const failure=(code:string,status:number)=>NextResponse.json({ok:false,code},{status});
async function access(req:Request,write:boolean){
 const user=await currentUserId();if(!user)return {error:failure("UNAUTHENTICATED",401)};
 const tenant=req.headers.get("x-foon-tenant");if(!tenant)return {error:failure("TENANT_CONTEXT_REQUIRED",400)};
 try{const ctx=await requireTenantMembership(user,tenant,write?["owner","manager"]:["owner","manager","accountant"]);return {tenantId:ctx.tenantId,userId:user};}catch{return {error:failure("FORBIDDEN",403)};}
}
export async function GET(req:Request){
 const a=await access(req,false);if(a.error)return a.error;
 try{
  // No read API returns secrets or their encrypted envelope.
  const [rows]=await database().execute<RowDataPacket[]>("SELECT s.branch_id,s.provider,s.enabled,s.currency,s.merchant_reference,s.public_key,g.mode,g.version,g.secret_key_set,g.webhook_secret_set FROM tenant_payment_settings s LEFT JOIN tenant_payment_gateway_credentials g ON g.tenant_id=s.tenant_id AND g.scope_key=s.scope_key WHERE s.tenant_id=? ORDER BY s.scope_key",[a.tenantId]);
  const settings=rows.map(row=>{
   const secrets={secret_key:Boolean(row.secret_key_set),webhook_secret:Boolean(row.webhook_secret_set)};
   const missing=isPaymentProvider(row.provider)?paymentMissingFields(row.provider,row.public_key,row.merchant_reference,secrets):["provider"];
   return {branch_id:row.branch_id,provider:row.provider,enabled:Boolean(row.enabled),currency:row.currency,merchant_reference:row.merchant_reference,public_key:row.public_key,mode:row.mode??"test",version:row.version??null,secrets,missing_fields:missing,status:row.provider==="manual"?(row.enabled?"cash_enabled":"disabled"):missing.length?"incomplete":"configured_pending_integration"};
  });
  return NextResponse.json({ok:true,settings,vault_ready:paymentVaultReady(),electronic_checkout_ready:false},{headers:{"Cache-Control":"no-store"}});
 }catch{return failure("PAYMENT_SETTINGS_UNAVAILABLE",503);}
}
export async function PUT(req:Request){
 try{assertSameOrigin(req);}catch{return failure("FORBIDDEN",403);}
 const a=await access(req,true);if(a.error)return a.error;
 const raw=await req.text();if(raw.length>16000)return failure("INVALID_INPUT",400);
 let b;try{b=JSON.parse(raw);}catch{return failure("INVALID_INPUT",400);}
 if(!b||typeof b!=="object"||Array.isArray(b)||!isPaymentProvider(b.provider)||typeof b.enabled!=="boolean"||typeof b.currency!=="string"||!/^[A-Z]{3}$/.test(b.currency)||typeof b.merchant_reference!=="string"||b.merchant_reference.length>120||typeof b.public_key!=="string"||b.public_key.length>255||(b.branch_id!==null&&b.branch_id!==undefined&&(typeof b.branch_id!=="string"||!/^[a-f0-9-]{36}$/i.test(b.branch_id))))return failure("INVALID_INPUT",400);
 const mode=b.mode??"test";
 if(!["test","live"].includes(mode)||(b.version!==undefined&&b.version!==null&&(!Number.isSafeInteger(b.version)||b.version<1)))return failure("INVALID_INPUT",400);
 const provided=b.credentials??{},clear=b.clear_credentials??[],names=["secret_key","webhook_secret"];
 if(!provided||typeof provided!=="object"||Array.isArray(provided)||Object.keys(provided).some(k=>!names.includes(k)||typeof provided[k]!=="string"||provided[k].length>4096)||!Array.isArray(clear)||clear.some((k:unknown)=>typeof k!=="string"||!names.includes(k)))return failure("INVALID_INPUT",400);
 if(b.enabled&&b.provider!=="manual")return failure("GATEWAY_NOT_CONNECTED",409);
 if(b.provider==="manual"&&(Object.values(provided).some(v=>typeof v==="string"&&v.trim())||b.public_key.trim()))return failure("INVALID_INPUT",400);
 if(b.provider==="manual"&&b.enabled&&!b.merchant_reference.trim())return failure("PAYMENT_REFERENCE_REQUIRED",400);
 try{validatePaymentKeys(b.provider,mode,b.public_key.trim(),String(provided.secret_key??"").trim());}catch{return failure("PAYMENT_KEY_MODE_MISMATCH",400);}
 if(Object.values(provided).some(v=>typeof v==="string"&&v.trim())&&!paymentVaultReady())return failure("PAYMENT_VAULT_NOT_CONFIGURED",503);
 const branch=b.branch_id||null,scope=branch??"tenant",db=await database().getConnection();
 try{
  await db.beginTransaction();
  if(branch){const [rows]=await db.execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[branch,a.tenantId]);if(!rows.length){await db.rollback();return failure("BRANCH_NOT_FOUND",404);}}
  await db.execute("SELECT id FROM tenant_payment_settings WHERE tenant_id=? AND scope_key=? FOR UPDATE",[a.tenantId,scope]);
  const [oldRows]=await db.execute<RowDataPacket[]>("SELECT provider,mode,credentials_ciphertext,version FROM tenant_payment_gateway_credentials WHERE tenant_id=? AND scope_key=? FOR UPDATE",[a.tenantId,scope]);
  const old=oldRows[0];
  if((old?Number(old.version):null)!==(b.version??null)){await db.rollback();return failure("PAYMENT_SETTINGS_CONFLICT",409);}
  const context={tenantId:a.tenantId!,scope,provider:b.provider,mode};
  const credentials:Record<string,string>=old?.credentials_ciphertext&&old.provider===b.provider&&old.mode===mode&&b.provider!=="manual"?decryptPaymentCredentials(String(old.credentials_ciphertext),context):{};
  for(const name of names){if(clear.includes(name))delete credentials[name];const value=provided[name]?.trim();if(value)credentials[name]=value;}
  if(b.provider==="manual")for(const name of names)delete credentials[name];
  const envelope=Object.keys(credentials).length?encryptPaymentCredentials(credentials,context):null;
  await db.execute("INSERT INTO tenant_payment_settings(id,tenant_id,branch_id,scope_key,provider,enabled,currency,merchant_reference,public_key) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE provider=VALUES(provider),enabled=VALUES(enabled),currency=VALUES(currency),merchant_reference=VALUES(merchant_reference),public_key=VALUES(public_key)",[randomUUID(),a.tenantId,branch,scope,b.provider,b.enabled,b.currency,b.merchant_reference.trim()||null,b.public_key.trim()||null]);
  const version=old?Number(old.version)+1:1;
  await db.execute("INSERT INTO tenant_payment_gateway_credentials(tenant_id,scope_key,provider,mode,credentials_ciphertext,secret_key_set,webhook_secret_set,version) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE provider=VALUES(provider),mode=VALUES(mode),credentials_ciphertext=VALUES(credentials_ciphertext),secret_key_set=VALUES(secret_key_set),webhook_secret_set=VALUES(webhook_secret_set),version=VALUES(version)",[a.tenantId,scope,b.provider,mode,envelope,Boolean(credentials.secret_key),Boolean(credentials.webhook_secret),version]);
  await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,?,?,?,?)",[a.userId,"tenant.payment_settings.updated","tenant",a.tenantId,JSON.stringify({scope,provider:b.provider,mode,enabled:b.enabled,currency:b.currency,version})]);
  await db.commit();return NextResponse.json({ok:true,version},{headers:{"Cache-Control":"no-store"}});
 }catch(error){await db.rollback();return failure(error instanceof Error&&error.message==="PAYMENT_VAULT_NOT_CONFIGURED"?error.message:"PAYMENT_SETTINGS_SAVE_FAILED",503);}finally{db.release();}
}
