import {NextResponse} from "next/server";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import {createMailProvider} from "@/scripts/mail-provider.mjs";

export const runtime="nodejs";
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const user=await currentUserId();
 if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const body=await request.json().catch(()=>null);
 const tenant=typeof body?.tenantId==="string"?body.tenantId:"";
 const resource=typeof body?.resourceId==="string"?body.resourceId:"";
 if(!/^[a-f0-9-]{36}$/i.test(tenant)||!/^[a-f0-9-]{36}$/i.test(resource))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{await requireTenantMembership(user,tenant,["owner","manager"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const db=database();
 const [rows]=await db.execute<RowDataPacket[]>("SELECT name,status,data FROM restaurant_resources WHERE id=? AND tenant_id=? AND kind='employee' AND archived=FALSE LIMIT 1",[resource,tenant]);
 if(!rows.length)return NextResponse.json({ok:false,code:"RESOURCE_NOT_FOUND"},{status:404});
 const data=typeof rows[0].data==="string"?JSON.parse(rows[0].data):rows[0].data;
 const email=String(data.email??"").trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||data.userId)return NextResponse.json({ok:false,code:"INVITATION_NOT_REQUIRED"},{status:409});
 const token=randomBytes(32).toString("base64url"),hash=createHash("sha256").update(token).digest("hex"),id=randomUUID();
 await db.execute("INSERT INTO employee_invites(id,tenant_id,resource_id,email,token_hash,expires_at) VALUES (?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 48 HOUR))",[id,tenant,resource,email,hash]);
 const url="https://nfoodz.com/employee-invite?token="+encodeURIComponent(token);
 let mail;
 try{mail=await createMailProvider();await mail.send({id,to:email,subject:"FOON | دعوة الانضمام لفريق المطعم",text:"تمت دعوتك للانضمام إلى فريق "+String(rows[0].name)+".\nالرابط صالح لمدة 48 ساعة:\n"+url+"\nإذا لم تطلب الانضمام فتجاهل الرسالة.",html:"<p>لديك دعوة للانضمام إلى فريق FOON.</p><p>الرابط صالح لمدة 48 ساعة.</p><p><a href=\""+url+"\">فتح الدعوة</a></p>"});}
 catch(error){await db.execute("DELETE FROM employee_invites WHERE id=?",[id]).catch(()=>{});
  const raw=error as {code?:string;responseCode?:number;message?:string};
  const code=raw?.message==="MAIL_PROVIDER_NOT_CONFIGURED"?"MAIL_PROVIDER_NOT_CONFIGURED":raw?.message==="MAIL_IDENTITY_INVALID"?"MAIL_IDENTITY_INVALID":raw?.code==="EAUTH"||raw?.responseCode===535?"SMTP_AUTH_FAILED":raw?.code==="ETIMEDOUT"||raw?.code==="ESOCKET"||raw?.code==="ECONNECTION"?"SMTP_CONNECTION_FAILED":raw?.message==="MAIL_RECIPIENT_NOT_ACCEPTED"?"MAIL_RECIPIENT_NOT_ACCEPTED":"MAIL_SEND_FAILED";
  console.error("[FOON employee invite mail]",{code,providerCode:raw?.code??null,responseCode:raw?.responseCode??null});
  return NextResponse.json({ok:false,code},{status:503});
 }
 finally{mail?.close();}
 return NextResponse.json({ok:true,expiresInHours:48});
}
