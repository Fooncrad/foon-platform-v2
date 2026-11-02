import {cookies} from "next/headers";
import Link from "next/link";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import VerifyEmailActions from "./verify-email-actions";
export const dynamic="force-dynamic";
export default async function VerifyEmailPage({searchParams}:{searchParams:Promise<{token?:string;sent?:string}>}){
 const params=await searchParams;
 const l=(await cookies()).get("foon_language")?.value;
 const language=l==="en"||l==="fr"?l:"ar";
 const user=await currentUserId();
 let verified=false;
 if(user){
  try{const [rows]=await database().execute<RowDataPacket[]>("SELECT email_verified_at FROM users WHERE id=? AND status='active' LIMIT 1",[user]);verified=Boolean(rows[0]?.email_verified_at);}catch{}
 }
 const labels={
  ar:{title:"تأكيد البريد الإلكتروني",message:"إذا وصلتك رسالة تأكيد فافتح رابطها لتوثيق بريدك. وإذا لم تصلك، اضغط «إعادة إرسال رابط التأكيد» أدناه. يمكنك الدخول إلى حسابك، لكن لا يمكنك إتمام طلب أو حجز حتى توثيق البريد.",back:"الانتقال إلى حسابي",login:"تسجيل الدخول"},
  en:{title:"Verify your email",message:"Open a verification link if you received one. Otherwise, select “Resend verification email” below. You can sign in while waiting, but checkout and reservations require a verified email.",back:"Continue to my account",login:"Sign in"},
  fr:{title:"Vérifier votre adresse e-mail",message:"Ouvrez le lien reçu pour vérifier votre adresse. Sinon, cliquez sur « Renvoyer le lien de vérification » ci-dessous. Vous pouvez vous connecter, mais les commandes et réservations exigent un e-mail vérifié.",back:"Continuer vers mon compte",login:"Se connecter"}
 }[language];
 return <main className="auth-shell" lang={language} dir={language==="ar"?"rtl":"ltr"}><section className="auth-card">
  <Link className="auth-brand" href="/">FOON</Link>
  <h1>{labels.title}</h1><p>{labels.message}</p>
  <VerifyEmailActions language={language} token={typeof params.token==="string"?params.token:""} signedIn={Boolean(user)} initiallyVerified={verified}/>
  <p><Link href={user?"/account":"/login"}>{user?labels.back:labels.login}</Link></p>
 </section></main>;
}
