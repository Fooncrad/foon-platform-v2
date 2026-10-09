import {NextResponse} from "next/server";
import {randomUUID,createHash,randomBytes} from "node:crypto";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {createMailProvider} from "@/scripts/mail-provider.mjs";
export const runtime="nodejs";
export async function POST(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const body=await request.json().catch(()=>null);
 const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({ok:false,code:"INVALID_EMAIL"},{status:400});
 let provider:Awaited<ReturnType<typeof createMailProvider>>;
 try{provider=await createMailProvider()}catch{return NextResponse.json({ok:false,code:"MAIL_PROVIDER_NOT_CONFIGURED"},{status:503})}
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT id FROM users WHERE email=? AND status='active' LIMIT 1",[email]);
  if(!rows.length)return NextResponse.json({ok:true});
  const userId=String(rows[0].id);
  const token=randomBytes(32).toString("base64url");
  const tokenHash=createHash("sha256").update(token).digest("hex");
  const id=randomUUID();
  await database().execute("INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL 30 MINUTE))",[id,userId,tokenHash]);
  const link="https://nfoodz.com/reset-password?token="+encodeURIComponent(token);
  try{
   await provider.send({id,to:email,subject:"FOON | Password reset / استعادة كلمة المرور",text:"طلب استعادة كلمة المرور لحساب FOON. الرابط صالح لمدة 30 دقيقة ويُستخدم مرة واحدة:\n"+link+"\nإذا لم تطلب الاستعادة فتجاهل هذه الرسالة.",html:"<p>طلب استعادة كلمة المرور لحساب FOON.</p><p>الرابط صالح لمدة 30 دقيقة ويُستخدم مرة واحدة.</p><p><a href=\""+link+"\">تعيين كلمة مرور جديدة / Reset password</a></p><p>إذا لم تطلب الاستعادة فتجاهل هذه الرسالة.</p>"});
  }catch{await database().execute("DELETE FROM password_reset_tokens WHERE id=?",[id]).catch(()=>{});return NextResponse.json({ok:false,code:"MAIL_SEND_FAILED"},{status:503})}
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({ok:false,code:"RESET_REQUEST_UNAVAILABLE"},{status:503})}
 finally{provider.close()}
}
