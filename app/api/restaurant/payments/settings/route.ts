import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
const providers=["manual","moyasar","tap","hyperpay","stripe","custom"] as const;
async function access(req:Request,write:boolean){
 const user=await currentUserId();if(!user)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=req.headers.get("x-foon-tenant");if(!tenant)return {error:NextResponse.json({ok:false,code:"TENANT_CONTEXT_REQUIRED"},{status:400})};
 try{const ctx=await requireTenantMembership(user,tenant,write?["owner","manager"]:["owner","manager","accountant"]);return {tenantId:ctx.tenantId};}catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})};}
}
export async function GET(req:Request){
 const a=await access(req,false);if(a.error)return a.error;
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT branch_id,provider,enabled,currency,merchant_reference,public_key FROM tenant_payment_settings WHERE tenant_id=? ORDER BY scope_key",[a.tenantId]);return NextResponse.json({ok:true,settings:rows});}
 catch{return NextResponse.json({ok:false,code:"PAYMENT_SETTINGS_UNAVAILABLE"},{status:503});}
}
export async function PUT(req:Request){
 try{assertSameOrigin(req);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const a=await access(req,true);if(a.error)return a.error;
 const b=await req.json().catch(()=>null);
 if(!b||typeof b!=="object"||Array.isArray(b)||typeof b.provider!=="string"||!providers.includes(b.provider as typeof providers[number])||typeof b.enabled!=="boolean"||typeof b.currency!=="string"||!/^[A-Z]{3}$/.test(b.currency)||typeof b.merchant_reference!=="string"||b.merchant_reference.length>120||typeof b.public_key!=="string"||b.public_key.length>255||(b.branch_id!==null&&b.branch_id!==undefined&&(typeof b.branch_id!=="string"||!/^[a-f0-9-]{36}$/i.test(b.branch_id))))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 // Providers are selectable but cannot be activated until an encrypted credential vault and verified integration exist.
 if(b.enabled&&b.provider!=="manual")return NextResponse.json({ok:false,code:"GATEWAY_NOT_CONNECTED"},{status:409});
 const branch=b.branch_id||null;const scope=branch??"tenant";
 const db=await database().getConnection();
 try{await db.beginTransaction();
 if(branch){const [rows]=await db.execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? LIMIT 1",[branch,a.tenantId]);if(!rows.length){await db.rollback();return NextResponse.json({ok:false,code:"BRANCH_NOT_FOUND"},{status:404});}}
 await db.execute("INSERT INTO tenant_payment_settings(id,tenant_id,branch_id,scope_key,provider,enabled,currency,merchant_reference,public_key) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE provider=VALUES(provider),enabled=VALUES(enabled),currency=VALUES(currency),merchant_reference=VALUES(merchant_reference),public_key=VALUES(public_key)",[randomUUID(),a.tenantId,branch,scope,b.provider,b.enabled,b.currency,b.merchant_reference.trim()||null,b.public_key.trim()||null]);
 await db.commit();return NextResponse.json({ok:true});}
 catch{await db.rollback();return NextResponse.json({ok:false,code:"PAYMENT_SETTINGS_SAVE_FAILED"},{status:503});}finally{db.release();}
}
