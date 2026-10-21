"use client";
import {useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";

type Language="ar"|"en"|"fr";
const copy={
 ar:{message:"بريد حسابك غير موثّق بعد. افتح رسالة التأكيد أو اطلب رسالة جديدة.",link:"تأكيد البريد",resend:"إعادة إرسال رابط التأكيد",sending:"جارٍ طلب الرابط…",queued:"تم إدراج رسالة التأكيد في قائمة الإرسال. تفقد الوارد والبريد غير المرغوب.",cooldown:"طُلب رابط مؤخرًا. يمكنك إعادة المحاولة بعد 5 دقائق.",verified:"تم تأكيد البريد الإلكتروني.",auth:"انتهت الجلسة. سجّل الدخول ثم أعد المحاولة.",error:"تعذر طلب رابط التأكيد. حاول مرة أخرى لاحقًا."},
 en:{message:"Your account email is not verified yet. Open the verification message or request a new one.",link:"Verify email",resend:"Resend verification link",sending:"Requesting link…",queued:"Verification email queued. Check your inbox and spam folder.",cooldown:"A link was recently requested. Try again after five minutes.",verified:"Email verified.",auth:"Your session expired. Sign in and try again.",error:"Could not request a verification link. Try again later."},
 fr:{message:"L’adresse e-mail de votre compte n’est pas encore vérifiée. Ouvrez le message de confirmation ou demandez un nouveau lien.",link:"Vérifier l’adresse",resend:"Renvoyer le lien de vérification",sending:"Demande du lien…",queued:"Message ajouté à la file d’envoi. Vérifiez votre boîte de réception et les indésirables.",cooldown:"Un lien a déjà été demandé. Réessayez dans cinq minutes.",verified:"Adresse e-mail vérifiée.",auth:"Votre session a expiré. Reconnectez-vous.",error:"Impossible de demander un lien. Réessayez plus tard."}
} as const;

export default function EmailVerificationNotice({language}:{language:Language}){
 const t=copy[language],router=useRouter();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(""),[verified,setVerified]=useState(false);
 async function resend(){
  if(busy||verified)return;
  setBusy(true);setMessage("");setError("");
  try{
   const response=await fetch("/api/auth/resend-verification",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
   const result=await response.json().catch(()=>null);
   if(!response.ok){setError(response.status===401?t.auth:t.error);return;}
   if(result?.verified){setVerified(true);setMessage(t.verified);router.refresh();return;}
   setMessage(result?.queued?t.queued:t.cooldown);
  }catch{setError(t.error);}finally{setBusy(false);}
 }
 if(verified)return <div className="restaurantEmailVerificationNotice" role="status">{t.verified}</div>;
 return <div className="restaurantEmailVerificationNotice" role="note">
  <p>{t.message}</p>
  <div className="restaurantEmailVerificationActions">
   <Link href="/verify-email">{t.link}</Link>
   <button type="button" disabled={busy} onClick={()=>void resend()}>{busy?t.sending:t.resend}</button>
  </div>
  {message&&<p className="restaurantEmailVerificationFeedback" role="status">{message}</p>}
  {error&&<p className="restaurantEmailVerificationFeedback" role="alert">{error}</p>}
 </div>;
}
