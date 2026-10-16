import {NextResponse} from 'next/server';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import type {RowDataPacket} from 'mysql2/promise';
import {database} from '@/lib/db/mysql';
import {assertSameOrigin} from '@/lib/security/origin';
import {dispatchNotifications} from '@/lib/notifications/dispatch';
export const runtime='nodejs';
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:'FORBIDDEN'},{status:403});}
 const body=await request.json().catch(()=>null),email=typeof body?.email==='string'?body.email.trim().toLowerCase():'';
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({ok:false,code:'INVALID_EMAIL'},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [rows]=await db.execute<RowDataPacket[]>("SELECT id,default_locale FROM users WHERE email=? AND status='active' LIMIT 1 FOR UPDATE",[email]);
  if(rows.length){
   const user=rows[0];
   const [recent]=await db.execute<RowDataPacket[]>('SELECT id FROM password_reset_tokens WHERE user_id=? AND created_at>DATE_SUB(NOW(),INTERVAL 5 MINUTE) LIMIT 1',[user.id]);
   if(!recent.length){
    const token=randomBytes(32).toString('base64url'),id=randomUUID();
    await db.execute('INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))',[id,user.id,createHash('sha256').update(token).digest('hex')]);
    const origin=new URL(process.env.APP_URL||'https://nfoodz.com');
    const link=new URL('/reset-password',origin);link.searchParams.set('token',token);
    const locale=user.default_locale,index=locale==='en'?1:locale==='fr'?2:0;
    const subject=['استعادة كلمة المرور — FOON','Reset your password — FOON','Réinitialiser votre mot de passe — FOON'][index];
    const text=['الرابط صالح لمدة 30 دقيقة ويُستخدم مرة واحدة. إذا لم تطلب الاستعادة فتجاهل الرسالة.','This one-time link expires in 30 minutes. Ignore this message if you did not request a reset.','Ce lien à usage unique expire dans 30 minutes. Ignorez ce message si vous n’avez pas demandé de réinitialisation.'][index]+'\n'+link.href;
    await db.execute("INSERT INTO platform_notification_outbox(id,event_key,recipient_email,subject,body_text) VALUES (?,'password_reset',?,?,?)",[id,email,subject,text]);
   }
  }
  await db.commit();dispatchNotifications();
  // Identical response for known, unknown and recently requested accounts.
  return NextResponse.json({ok:true,queued:true});
 }catch{await db.rollback();return NextResponse.json({ok:false,code:'RESET_REQUEST_UNAVAILABLE'},{status:503});}finally{db.release();}
}
