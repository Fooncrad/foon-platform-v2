"use client";
import InlineCustomerAuth from "./inline-customer-auth";
import Link from "next/link";
import {useRef,useState,type FormEvent} from "react";
type Language="ar"|"en"|"fr";
type RequestType="appointment"|"quote"|"inquiry";
const labels={
 ar:{appointment:"طلب موعد للخدمة",quote:"طلب عرض سعر",inquiry:"الاستفسار عن الخدمة",phone:"رقم الجوال",notes:"تفاصيل الطلب",date:"الموعد المطلوب",send:"إرسال الطلب",close:"إغلاق",working:"جارٍ الإرسال…",success:"تم استلام طلبك. ينتظر مراجعة النشاط ولا يُعد حجزًا مؤكدًا.",login:"سجّل الدخول لإرسال الطلب",register:"إنشاء حساب",disabled:"تسجيل حساب العميل متوقف مؤقتًا لدى هذا النشاط.",fail:"تعذر إرسال الطلب. تحقق من البيانات وحاول مجددًا.",limit:"وصلت إلى الحد المسموح من الطلبات مؤقتًا.",pending:"حالة الطلب: بانتظار المراجعة",reference:"رقم الطلب",track:"متابعة الطلب من حسابي"},
 en:{appointment:"Request appointment",quote:"Request a quotation",inquiry:"Ask about this service",phone:"Contact phone",notes:"Request details",date:"Preferred appointment",send:"Send request",close:"Close",working:"Sending…",success:"Request received for business review. This is not a confirmed booking.",login:"Sign in to send a request",register:"Create account",disabled:"Customer account sign-in is temporarily disabled for this business.",fail:"Request failed. Check your details and try again.",limit:"Temporary request limit reached.",pending:"Status: pending review",reference:"Request ID",track:"Track in my account"},
 fr:{appointment:"Demander un rendez-vous",quote:"Demander un devis",inquiry:"Se renseigner",phone:"Téléphone",notes:"Détails de la demande",date:"Rendez-vous souhaité",send:"Envoyer",close:"Fermer",working:"Envoi…",success:"Demande reçue. La réservation n’est pas confirmée.",login:"Connectez-vous pour envoyer",register:"Créer un compte",disabled:"La connexion client est temporairement désactivée pour cette entreprise.",fail:"Échec de l’envoi. Vérifiez vos informations.",limit:"Limite temporaire de demandes atteinte.",pending:"Statut : à vérifier",reference:"Référence",track:"Suivre depuis mon compte"}
};
export default function ServiceRequestAction({slug,serviceId,serviceName,mode,language,signedIn,linked,defaultPhone="",customerLoginEnabled=true}:{slug:string;serviceId:string;serviceName:string;mode:RequestType;language:Language;signedIn:boolean;linked:boolean;defaultPhone?:string;customerLoginEnabled?:boolean}){
 const t=labels[language],requestRef=useRef<{key:string;payload:string}|null>(null);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[success,setSuccess]=useState(""),[error,setError]=useState("");
 const [joined,setJoined]=useState(linked),[authenticated,setAuthenticated]=useState(signedIn);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||!authenticated)return;
  const fields=new FormData(event.currentTarget);
  const input=String(fields.get("scheduledAt")??"");
  const scheduled=mode==="appointment"?new Date(input):null;
  if(mode==="appointment"&&(!scheduled||!Number.isFinite(scheduled.getTime()))){setError(t.fail);return;}
  const body={storeSlug:slug,serviceId,requestType:mode,phone:String(fields.get("phone")??"").trim(),notes:String(fields.get("notes")??"").trim(),...(scheduled?{scheduledAt:scheduled.toISOString()}:{})};
  const payload=JSON.stringify(body);
  if(requestRef.current?.payload!==payload)requestRef.current={payload,key:crypto.randomUUID()};
  setBusy(true);setError("");
  try{
   if(!joined){
    const join=await fetch("/api/customer/join-store",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({storeSlug:slug})});
    if(!join.ok)throw Error("JOIN_FAILED");
    setJoined(true);
   }
   const response=await fetch("/api/customer/service-requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,requestKey:requestRef.current.key})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.code??"SAVE_FAILED");
   setSuccess(String(result.id));window.dispatchEvent(new CustomEvent("foon:service-request-sent"));requestRef.current=null;
  }catch(e){setError(e instanceof Error&&e.message==="RATE_LIMITED"?t.limit:t.fail);}
  finally{setBusy(false);}
 }
 return <div className="foonServiceRequestAction">
  {!open&&<button type="button" className="foonActivityServiceContact" onClick={()=>{setSuccess("");setError("");setOpen(true);}}>{t[mode]}</button>}
  {open&&<div className="foonServiceRequestForm" dir={language==="ar"?"rtl":"ltr"}>
   {success?<div role="status"><p>{t.success}</p><small>{t.reference}: <b dir="ltr">{success.slice(0,8)}</b></small><p>{t.pending}</p><Link href="/customer#customer-service-requests">{t.track}</Link><button type="button" onClick={()=>setOpen(false)}>{t.close}</button></div>:
   <div className="foonServiceRequestJourney">
   <form onSubmit={submit}>
    <strong>{serviceName}</strong>
    <label>{t.phone}<input name="phone" type="tel" inputMode="tel" dir="ltr" maxLength={40} defaultValue={defaultPhone} required pattern="[+0-9 ()-]{7,40}"/></label>
    {mode==="appointment"&&<label>{t.date}<input name="scheduledAt" type="datetime-local" dir="ltr" lang="en" required/></label>}
    <label>{t.notes}<textarea name="notes" rows={3} maxLength={1000} defaultValue="" placeholder={t.notes}/></label>
    {error&&<p role="alert">{error}</p>}
    {!authenticated&&<p role="status">{t.login}</p>}
    <div className="foonServiceRequestButtons"><button type="submit" disabled={busy||!authenticated}>{busy?t.working:t.send}</button><button type="button" disabled={busy} onClick={()=>setOpen(false)}>{t.close}</button></div>
   </form>
   {!authenticated&&(customerLoginEnabled?<InlineCustomerAuth slug={slug} language={language} purpose="service" onSuccess={()=>{setAuthenticated(true);setJoined(true);setError("");window.dispatchEvent(new CustomEvent("foon:customer-authenticated",{detail:{slug}}));}}/>:<p role="status">{t.disabled}</p>)}
   </div>}
  </div>}
 </div>;
}
