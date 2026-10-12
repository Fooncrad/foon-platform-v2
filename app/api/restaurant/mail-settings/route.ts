import {NextResponse} from "next/server";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import {encryptSmtpPassword,tenantMailSettings} from "@/lib/restaurant/mail-settings";
export const runtime="nodejs";
async function authorize(request:Request){
 const user=await currentUserId();if(!user)throw Error("UNAUTHENTICATED");
 const tenantId=request.headers.get("x-foon-tenant")??"";
 await requireTenantMembership(user,tenantId,["owner","manager"]);
 return tenantId;
}
export async function GET(request:Request){
 try{const tenantId=await authorize(request);const s=await tenantMailSettings(tenantId);
 return NextResponse.json({ok:true,mode:s?.mode==="custom"?"custom":"platform",host:s?.smtp_host??"",port:465,user:s?.smtp_user??"",fromName:s?.smtp_from_name??"",passwordSet:Boolean(s?.smtp_secret),platformConfigured:Boolean(process.env.SMTP_PASSWORD)});
 }catch{return NextResponse.json({ok:false,code:"MAIL_SETTINGS_UNAVAILABLE"},{status:403});}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);const tenantId=await authorize(request);
 const body=await request.json().catch(()=>null);
 if(!body||!["platform","custom"].includes(body.mode))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 if(body.mode==="platform"){
  await database().execute("INSERT INTO tenant_mail_settings(tenant_id,mode) VALUES (?,'platform') ON DUPLICATE KEY UPDATE mode='platform'",[tenantId]);
  return NextResponse.json({ok:true,mode:"platform"});
 }
 const host=String(body.host??"").trim().toLowerCase(),user=String(body.user??"").trim().toLowerCase(),fromName=String(body.fromName??"").trim(),password=String(body.password??"");
 if(!/^[a-z0-9.-]{4,253}$/.test(host)||!host.includes(".")||!/^\S+@\S+\.\S+$/.test(user)||fromName.length>160||password.length>256||Number(body.port)!==465)return NextResponse.json({ok:false,code:"INVALID_SMTP_SETTINGS"},{status:400});
 const previous=await tenantMailSettings(tenantId);
 if(!password&&(!previous?.smtp_secret||previous.smtp_user!==user))return NextResponse.json({ok:false,code:"SMTP_PASSWORD_REQUIRED"},{status:400});
 const secret=password?encryptSmtpPassword(password):String(previous.smtp_secret);
 await database().execute("INSERT INTO tenant_mail_settings(tenant_id,mode,smtp_host,smtp_port,smtp_user,smtp_from,smtp_from_name,smtp_secret) VALUES (?,'custom',?,465,?,?,?,?) ON DUPLICATE KEY UPDATE mode='custom',smtp_host=VALUES(smtp_host),smtp_port=465,smtp_user=VALUES(smtp_user),smtp_from=VALUES(smtp_from),smtp_from_name=VALUES(smtp_from_name),smtp_secret=VALUES(smtp_secret)",[tenantId,host,user,user,fromName||"FOON",secret]);
 return NextResponse.json({ok:true,mode:"custom"});
 }catch(error){const message=error instanceof Error?error.message:"";return NextResponse.json({ok:false,code:message==="MAIL_ENCRYPTION_KEY_NOT_CONFIGURED"?message:"MAIL_SETTINGS_UNAVAILABLE"},{status:503});}
}
