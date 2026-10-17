import {createHash,randomBytes,randomUUID} from "node:crypto";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";

export const EMAIL_VERIFICATION_MINUTES=24*60;
export const EMAIL_RESEND_COOLDOWN_MINUTES=5;
export const verificationTokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export const validVerificationToken=(value:unknown):value is string=>typeof value==="string"&&/^[A-Za-z0-9_-]{43}$/.test(value);
export type VerificationLocale="ar"|"en"|"fr";

export function verificationEmailCopy(locale:VerificationLocale,url:string){
 const content={
  ar:{subject:"تأكيد بريدك الإلكتروني — FOON",message:"لتأكيد بريدك الإلكتروني في FOON، افتح الرابط التالي. الرابط صالح لمدة 24 ساعة ولمرة واحدة. إذا لم تطلب إنشاء حساب، يمكنك تجاهل الرسالة."},
  en:{subject:"Verify your email — FOON",message:"Confirm your FOON email by opening the link below. The link expires after 24 hours and can only be used once. If you did not create an account, ignore this message."},
  fr:{subject:"Vérifiez votre adresse e-mail — FOON",message:"Confirmez votre adresse e-mail FOON en ouvrant le lien ci-dessous. Il expire dans 24 heures et ne peut être utilisé qu’une seule fois. Si vous n’avez pas créé de compte, ignorez ce message."}
 }[locale];
 return {subject:content.subject,body:content.message+"\n"+url};
}
export function verificationUrl(origin:string,token:string){
 const parsed=new URL(origin);
 if(!["https:","http:"].includes(parsed.protocol)||!validVerificationToken(token))throw Error("INVALID_VERIFICATION_URL");
 const url=new URL("/verify-email",parsed);url.searchParams.set("token",token);return url.toString();
}
/** Call inside a transaction that creates/locks the user. */
export async function queueVerificationMail(db:PoolConnection,{userId,email,locale,origin}:{userId:string;email:string;locale:VerificationLocale;origin:string}){
 const id=randomUUID(),token=randomBytes(32).toString("base64url");
 const message=verificationEmailCopy(locale,verificationUrl(origin,token));
 await db.execute("INSERT INTO email_verification_tokens(id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL ? MINUTE))",
  [id,userId,verificationTokenHash(token),EMAIL_VERIFICATION_MINUTES]);
 await db.execute("INSERT INTO platform_notification_outbox(id,event_key,recipient_email,subject,body_text) VALUES (?,'email_verification',?,?,?)",
  [id,email,message.subject,message.body]);
 return id;
}
export async function verificationCooldownActive(db:PoolConnection,userId:string){
 const [rows]=await db.execute<RowDataPacket[]>(
  "SELECT id FROM email_verification_tokens WHERE user_id=? AND created_at>DATE_SUB(NOW(),INTERVAL ? MINUTE) LIMIT 1",
  [userId,EMAIL_RESEND_COOLDOWN_MINUTES]);
 return rows.length>0;
}
