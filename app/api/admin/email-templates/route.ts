import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import {mailConfiguration,createMailProvider} from "@/scripts/mail-provider.mjs";
import {validateEmailTemplate,defaultEmailTemplates} from "@/scripts/email-templates.mjs";
async function authorize(write:boolean){
 const id=await currentActiveAdminUserId();if(!id)throw Error("UNAUTHENTICATED");
 await requirePlatformRole(id,write?["super_admin","admin"]:["super_admin","admin","support"]);return id;
}
export async function GET(){
 try{await authorize(false);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const config=mailConfiguration();let templates=defaultEmailTemplates;let storageReady=true;
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT template_key,subject_template,body_template FROM platform_email_templates");templates=rows.map(r=>({template_key:String(r.template_key),subject_template:String(r.subject_template),body_template:String(r.body_template)}));}
 catch{storageReady=false;}
 return NextResponse.json({ok:true,templates,storageReady,mail:{configured:config.configured,from:config.from,name:config.name,shared:true}});
}
export async function PUT(request:Request){
 let actor;try{assertSameOrigin(request);actor=await authorize(true);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const b=await request.json().catch(()=>null);
 if(!b||!validateEmailTemplate(b))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{await db.beginTransaction();
 await db.execute("INSERT INTO platform_email_templates(template_key,subject_template,body_template,updated_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE subject_template=VALUES(subject_template),body_template=VALUES(body_template),updated_by=VALUES(updated_by)",[b.template_key,b.subject_template.trim(),b.body_template,actor]);
 await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id) VALUES (?,'platform.email_template.updated','email_template',?)",[actor,b.template_key]);
 await db.commit();return NextResponse.json({ok:true});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:"TEMPLATE_SAVE_FAILED"},{status:503});}finally{db.release();}
}
export async function POST(request:Request){
 try{assertSameOrigin(request);await authorize(true);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 let provider;
 try{provider=await createMailProvider();await provider.verify();return NextResponse.json({ok:true,verified:true,note:"Connection and authentication verified. No email sent."});}
 catch(error){const code=(error as {code?:string}).code;return NextResponse.json({ok:false,code:code==="EAUTH"?"SMTP_AUTH_FAILED":"SMTP_CONNECTION_FAILED"},{status:503});}
 finally{provider?.close();}
}
