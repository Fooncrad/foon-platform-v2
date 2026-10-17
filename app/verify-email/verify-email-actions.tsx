"use client";
import {useState} from "react";
type Lang="ar"|"en"|"fr";
const copy={
 ar:{confirm:"تأكيد البريد بالرابط",send:"إعادة إرسال رابط التأكيد",busy:"جارٍ التنفيذ…",success:"تم توثيق بريدك بنجاح.",already:"بريدك الإلكتروني موثّق بالفعل.",queued:"تمت إضافة رسالة التأكيد إلى قائمة الإرسال. تفقد البريد الوارد والرسائل غير المرغوبة.",wait:"أُرسلت رسالة مؤخرًا. انتظر خمس دقائق قبل إعادة الطلب.",invalid:"الرابط غير صالح أو منتهي أو مستخدم. اطلب رابطًا جديدًا.",error:"تعذر إكمال العملية حاليًا. حاول مرة أخرى.",needLogin:"سجّل الدخول لطلب رسالة تأكيد جديدة.",continue:"الانتقال إلى حسابي"},
 en:{confirm:"Verify email using this link",send:"Resend verification email",busy:"Working…",success:"Your email is verified.",already:"Your email is already verified.",queued:"Verification email queued. Check your inbox and spam folder.",wait:"An email was requested recently. Wait five minutes before requesting again.",invalid:"Link is invalid, expired or already used. Request a new one.",error:"Unable to complete this action. Try again.",needLogin:"Sign in to request a new verification email.",continue:"Continue to my account"},
 fr:{confirm:"Vérifier avec ce lien",send:"Renvoyer le lien de vérification",busy:"En cours…",success:"Votre adresse e-mail est vérifiée.",already:"Votre adresse e-mail est déjà vérifiée.",queued:"Message ajouté à la file d’envoi. Vérifiez votre boîte de réception et les courriers indésirables.",wait:"Une demande récente existe. Attendez cinq minutes.",invalid:"Lien invalide, expiré ou déjà utilisé. Demandez-en un nouveau.",error:"Action indisponible. Veuillez réessayer.",needLogin:"Connectez-vous pour demander un nouveau lien.",continue:"Continuer vers mon compte"}
};
export default function VerifyEmailActions({language,token,signedIn,initiallyVerified}:{language:Lang;token:string;signedIn:boolean;initiallyVerified:boolean}){
 const t=copy[language];
 const [busy,setBusy]=useState(false),[verified,setVerified]=useState(initiallyVerified),[message,setMessage]=useState(""),[error,setError]=useState("");
 async function send(action:"verify"|"resend"){
  if(busy)return;setBusy(true);setMessage("");setError("");
  try{
   const response=await fetch(action==="verify"?"/api/auth/verify-email":"/api/auth/resend-verification",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(action==="verify"?{token}:{})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok){setError(action==="verify"&&result.code==="VERIFICATION_LINK_INVALID"?t.invalid:t.error);return;}
   if(result.verified){setVerified(true);setMessage(action==="verify"?t.success:t.already);}
   else setMessage(result.queued?t.queued:t.wait);
  }catch{setError(t.error)}finally{setBusy(false);}
 }
 return <div className="auth-form" aria-live="polite">
  {verified?<p role="status">{t.already}</p>:
   <>{token&&<button type="button" disabled={busy} onClick={()=>void send("verify")}>{busy?t.busy:t.confirm}</button>}
   {signedIn?<button type="button" disabled={busy} onClick={()=>void send("resend")}>{busy?t.busy:t.send}</button>:!token&&<p>{t.needLogin}</p>}</>}
  {message&&<p role="status">{message}</p>}
  {error&&<p role="alert">{error}</p>}
 </div>;
}
