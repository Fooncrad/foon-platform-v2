import {randomBytes,randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {isPaymentProvider,paymentMissingFields,validatePaymentKeys} from "@/lib/payments/provider-catalog";
import {decryptPaymentCredentials,encryptPaymentCredentials,paymentVaultReady} from "@/lib/payments/credential-vault.mjs";

function webhookUrl(endpoint:string){
 try{const url=new URL(process.env.APP_URL??"");if(url.username||url.password||url.protocol!=="https:"&&!(url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname)))return null;return url.origin+"/api/payments/webhooks/"+endpoint;}catch{return null;}
}
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
  const [rows]=await database().execute<RowDataPacket[]>("SELECT s.branch_id,s.provider,s.enabled,s.currency,s.merchant_reference,s.public_key,g.mode,g.version,g.secret_key_set,g.webhook_secret_set,e.endpoint_id,(SELECT r.received_at FROM tenant_payment_webhook_receipts r WHERE r.endpoint_id=e.endpoint_id ORDER BY r.sequence_id DESC LIMIT 1) AS last_webhook_at,(SELECT r.status FROM tenant_payment_webhook_receipts r WHERE r.endpoint_id=e.endpoint_id ORDER BY r.sequence_id DESC LIMIT 1) AS last_webhook_status FROM tenant_payment_settings s LEFT JOIN tenant_payment_gateway_credentials g ON g.tenant_id=s.tenant_id AND g.scope_key=s.scope_key LEFT JOIN tenant_payment_webhook_endpoints e ON e.tenant_id=s.tenant_id AND e.scope_key=s.scope_key AND e.provider=s.provider AND e.mode=g.mode WHERE s.tenant_id=? ORDER BY s.scope_key",[a.tenantId]);
  const settings=rows.map(row=>{
   const secrets={secret_key:Boolean(row.secret_key_set),webhook_secret:Boolean(row.webhook_secret_set)};
   const missing=isPaymentProvider(row.provider)?paymentMissingFields(row.provider,row.public_key,row.merchant_reference,secrets):["provider"];
   return {branch_id:row.branch_id,provider:row.provider,enabled:Boolean(row.enabled),currency:row.currency,merchant_reference:row.merchant_reference,public_key:row.public_key,webhook:{supported:["moyasar","tap","stripe","hyperpay"].includes(row.provider),url:row.endpoint_id?webhookUrl(String(row.endpoint_id)):null,ready:row.provider==="tap"?secrets.secret_key:secrets.webhook_secret,last_received_at:row.last_webhook_at?new Date(row.last_webhook_at).toISOString():null,last_status:row.last_webhook_status??null},mode:row.mode??"test",version:row.version??null,secrets,missing_fields:missing,checkout_supported:row.provider==="tap"&&row.mode==="test",status:row.provider==="manual"?(row.enabled?"cash_enabled":"disabled"):missing.length?"incomplete":row.provider==="tap"&&row.mode==="test"?(row.enabled?"test_checkout_enabled":"test_checkout_available"):"configured_pending_integration"};
  });
  return NextResponse.json({ok:true,settings,vault_ready:paymentVaultReady(),electronic_checkout_ready:true,supported_checkout:[{provider:"tap",mode:"test"}]},{headers:{"Cache-Control":"no-store"}});
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
 if(b.enabled&&b.provider!=="manual"&&!(b.provider==="tap"&&mode==="test"))return failure("GATEWAY_NOT_CONNECTED",409);
 if(b.provider==="manual"&&(Object.values(provided).some(v=>typeof v==="string"&&v.trim())||b.public_key.trim()))return failure("INVALID_INPUT",400);
 if(b.provider==="manual"&&b.enabled&&!b.merchant_reference.trim())return failure("PAYMENT_REFERENCE_REQUIRED",400);
 try{validatePaymentKeys(b.provider,mode,b.public_key.trim(),String(provided.secret_key??"").trim());}catch{return failure("PAYMENT_KEY_MODE_MISMATCH",400);}
 if(Object.values(provided).some(v=>typeof v==="string"&&v.trim())&&!paymentVaultReady())return failure("PAYMENT_VAULT_NOT_CONFIGURED",503);
 const branch=b.branch_id||null,scope=branch??"tenant",db=await database().getConnection();
 try{
  await db.beginTransaction();
  if(branch){const [rows]=await db.execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[branch,a.tenantId]);if(!rows.length){await db.rollback();return failure("BRANCH_NOT_FOUND",404);}}
  const [settingRows]=await db.execute<RowDataPacket[]>("SELECT id,merchant_reference,currency,enabled FROM tenant_payment_settings WHERE tenant_id=? AND scope_key=? FOR UPDATE",[a.tenantId,scope]);
  const [oldRows]=await db.execute<RowDataPacket[]>("SELECT provider,mode,credentials_ciphertext,version FROM tenant_payment_gateway_credentials WHERE tenant_id=? AND scope_key=? FOR UPDATE",[a.tenantId,scope]);
  const old=oldRows[0];
  // Creation can be uncertain before a provider ID is known. Do not rotate its keys,
  // disable the scope, change its currency, or create a branch override underneath it.
  const [openCheckouts]=await db.execute<RowDataPacket[]>("SELECT c.id FROM tenant_payment_checkouts c LEFT JOIN tenant_payment_attempts p ON p.tenant_id=c.tenant_id AND p.provider=c.provider AND p.mode=c.mode AND p.provider_payment_id=c.provider_payment_id WHERE c.tenant_id=? AND (c.scope_key=? OR c.branch_id=?) AND (c.state IN ('creating','uncertain','review') OR c.state='ready' AND (p.id IS NULL OR p.status='pending')) LIMIT 1 FOR UPDATE",[a.tenantId,scope,branch]);
  if(openCheckouts.length){await db.rollback();return failure("PAYMENT_ATTEMPTS_PENDING",409);}

  if(old&&(old.provider!==b.provider||old.mode!==mode||clear.length>0||Object.values(provided).some(v=>typeof v==="string"&&v.trim())||String(settingRows[0]?.merchant_reference??"")!==b.merchant_reference.trim()||settingRows[0]?.currency!==b.currency||Boolean(settingRows[0]?.enabled)!==b.enabled)){
   const [pending]=await db.execute<RowDataPacket[]>("SELECT id FROM tenant_payment_attempts WHERE tenant_id=? AND scope_key=? AND status='pending' LIMIT 1 FOR UPDATE",[a.tenantId,scope]);
   if(pending.length){await db.rollback();return failure("PAYMENT_ATTEMPTS_PENDING",409);}
  }
  if((old?Number(old.version):null)!==(b.version??null)){await db.rollback();return failure("PAYMENT_SETTINGS_CONFLICT",409);}
  const context={tenantId:a.tenantId!,scope,provider:b.provider,mode};
  const credentials:Record<string,string>=old?.credentials_ciphertext&&old.provider===b.provider&&old.mode===mode&&b.provider!=="manual"?decryptPaymentCredentials(String(old.credentials_ciphertext),context):{};
  for(const name of names){if(clear.includes(name))delete credentials[name];const value=provided[name]?.trim();if(value)credentials[name]=value;}
  if(b.provider==="manual")for(const name of names)delete credentials[name];
  if(b.provider==="hyperpay"&&credentials.webhook_secret&&!/^[a-f0-9]{64}$/i.test(credentials.webhook_secret)){await db.rollback();return failure("INVALID_WEBHOOK_SECRET",400);}
  if(b.enabled&&b.provider==="tap"&&(!paymentVaultReady()||!webhookUrl("ready")||!credentials.secret_key||!b.public_key.trim())){
   await db.rollback();return failure("PAYMENT_SETUP_INCOMPLETE",409);
  }
  if(b.enabled&&b.provider==="tap"&&new URL(process.env.APP_URL??"").protocol!=="https:"){await db.rollback();return failure("CHECKOUT_HTTPS_REQUIRED",409);}
  const envelope=Object.keys(credentials).length?encryptPaymentCredentials(credentials,context):null;
  await db.execute("INSERT INTO tenant_payment_settings(id,tenant_id,branch_id,scope_key,provider,enabled,currency,merchant_reference,public_key) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE provider=VALUES(provider),enabled=VALUES(enabled),currency=VALUES(currency),merchant_reference=VALUES(merchant_reference),public_key=VALUES(public_key)",[randomUUID(),a.tenantId,branch,scope,b.provider,b.enabled,b.currency,b.merchant_reference.trim()||null,b.public_key.trim()||null]);
  const version=old?Number(old.version)+1:1;
  await db.execute("INSERT INTO tenant_payment_gateway_credentials(tenant_id,scope_key,provider,mode,credentials_ciphertext,secret_key_set,webhook_secret_set,version) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE provider=VALUES(provider),mode=VALUES(mode),credentials_ciphertext=VALUES(credentials_ciphertext),secret_key_set=VALUES(secret_key_set),webhook_secret_set=VALUES(webhook_secret_set),version=VALUES(version)",[a.tenantId,scope,b.provider,mode,envelope,Boolean(credentials.secret_key),Boolean(credentials.webhook_secret),version]);
  if(["moyasar","tap","stripe","hyperpay"].includes(b.provider)){
   const [endpoints]=await db.execute<RowDataPacket[]>("SELECT endpoint_id,provider,mode FROM tenant_payment_webhook_endpoints WHERE tenant_id=? AND scope_key=? FOR UPDATE",[a.tenantId,scope]);
   const existing=endpoints[0];const endpointId=existing?.provider===b.provider&&existing.mode===mode?String(existing.endpoint_id):randomBytes(24).toString("hex");
   await db.execute("INSERT INTO tenant_payment_webhook_endpoints(tenant_id,scope_key,endpoint_id,provider,mode) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE endpoint_id=VALUES(endpoint_id),provider=VALUES(provider),mode=VALUES(mode)",[a.tenantId,scope,endpointId,b.provider,mode]);
  }else await db.execute("DELETE FROM tenant_payment_webhook_endpoints WHERE tenant_id=? AND scope_key=?",[a.tenantId,scope]);
  await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,?,?,?,?)",[a.userId,"tenant.payment_settings.updated","tenant",a.tenantId,JSON.stringify({scope,provider:b.provider,mode,enabled:b.enabled,currency:b.currency,version})]);
  await db.commit();return NextResponse.json({ok:true,version},{headers:{"Cache-Control":"no-store"}});
 }catch(error){await db.rollback();return failure(error instanceof Error&&error.message==="PAYMENT_VAULT_NOT_CONFIGURED"?error.message:"PAYMENT_SETTINGS_SAVE_FAILED",503);}finally{db.release();}
}

