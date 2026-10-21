"use client";
import {useState} from "react";
import Link from "next/link";

type Language="ar"|"en"|"fr";
type Status="queued"|"cooldown"|"verified"|"error"|"";
const copy={
 ar:{
  notice:"بريد حسابك غير موثّق. أرسل رابط التأكيد إلى بريدك الإلكتروني، ثم افتح الرسالة لتوثيقه.",
  send:"إرسال رابط تأكيد البريد",
  sending:"جارٍ طلب الرابط…",
  open:"فتح صفحة تأكيد البريد",
  queued:"أُضيفت رسالة التأكيد إلى قائمة الإرسال. تحقق من الوارد والرسائل غير المرغوبة. هذا لا يعني أنها وصلت بالفعل.",
  cooldown:"طُلب رابط مؤخرًا. انتظر 5 دقائق قبل إعادة الطلب، أو افتح الرابط الذي وصلك.",
  verified:"بريدك موثّق بالفعل. حدّث الصفحة لإخفاء التنبيه.",
  error:"تعذر طلب رابط التأكيد حاليًا. أعد المحاولة لاحقًا أو تواصل مع الدعم."
 },
 en:{
  notice:"Your account email is not verified. Request a verification link, then open the email to confirm it.",
  send:"Send email verification link",
  sending:"Requesting link…",
  open:"Open email verification page",
  queued:"Your verification email has been queued. Check your inbox and spam folder. This does not confirm delivery.",
  cooldown:"A link was requested recently. Wait 5 minutes before trying again, or use the link you received.",
  verified:"Your email is already verified. Refresh the page to dismiss this notice.",
  error:"Could not request a verification link. Try again later or contact support."
 },
 fr:{
  notice:"L’adresse e-mail de votre compte n’est pas vérifiée. Demandez un lien et ouvrez le message pour la confirmer.",
  send:"Envoyer un lien de vérification",
  sending:"Demande en cours…",
  open:"Ouvrir la page de vérification",
  queued:"Le message de vérification a été mis en file d’attente. Consultez votre boîte de réception et vos indésirables. La livraison n’est pas confirmée.",
  cooldown:"Un lien a été demandé récemment. Patientez 5 minutes avant de réessayer ou utilisez le lien reçu.",
  verified:"Votre adresse est déjà vérifiée. Actualisez la page pour masquer cet avis.",
  error:"Impossible de demander le lien. Réessayez plus tard ou contactez l’assistance."
 }
} as const;

export default function MerchantEmailVerificationNotice({language}:{language:Language}){
 const t=copy[language];
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState<Status>("");
 async function requestLink(){
  if(busy)return;
  setBusy(true);setStatus("");
  try{
   const response=await fetch("/api/auth/resend-verification",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
   const result=await response.json().catch(()=>null);
   if(!response.ok){setStatus("error");return;}
   setStatus(result?.verified?"verified":result?.queued?"queued":"cooldown");
  }catch{setStatus("error");}
  finally{setBusy(false);}
 }
 return <div role="note" className="restaurantPanel merchantEmailVerificationNotice">
  <p>{t.notice}</p>
  <div className="merchantEmailVerificationActions">
   <button type="button" className="merchantEmailVerificationSend" disabled={busy} onClick={()=>void requestLink()}>{busy?t.sending:t.send}</button>
   <Link className="merchantEmailVerificationOpen" href="/verify-email">{t.open}</Link>
  </div>
  {status&&<p role={status==="error"?"alert":"status"} className="merchantEmailVerificationFeedback">{t[status]}</p>}
 </div>;
}
