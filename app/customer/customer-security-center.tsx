"use client";
import {useCallback,useEffect,useState} from "react";
type Lang="ar"|"en"|"fr";
type Session={id:string;current:boolean;createdAt:string;lastSeenAt:string;expiresAt:string};
export default function CustomerSecurityCenter({language}:{language:Lang}){
 const t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const [sessions,setSessions]=useState<Session[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState(""),[limited,setLimited]=useState(false);
 const load=useCallback(async()=>{
  const r=await fetch("/api/customer/security/sessions",{cache:"no-store"});const data=await r.json().catch(()=>null);
  if(!r.ok||!data?.ok||!Array.isArray(data.sessions))throw Error("SESSIONS_UNAVAILABLE");
  setSessions(data.sessions);setLimited(data.limited===true);
 },[]);
 useEffect(()=>{let active=true;void load().catch(()=>{if(active)setError(t("تعذر تحميل الجلسات.","Sessions could not be loaded.","Impossible de charger les sessions."));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[load,language]);
 async function revoke(id?:string){
  if(busy)return;
  const question=id?t("إنهاء جلسة هذا الجهاز الآخر؟","Sign out this other session?","Déconnecter cette autre session ?"):t("إنهاء جميع الجلسات الأخرى مع الحفاظ على هذه الجلسة؟","Sign out other sessions and keep this one?","Déconnecter les autres sessions en conservant celle-ci ?");
  if(!window.confirm(question))return;
  setBusy(true);setMessage("");setError("");
  try{
   const r=await fetch("/api/customer/security/sessions",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify(id?{id}:{allOthers:true})});
   const data=await r.json().catch(()=>null);if(!r.ok||!data?.ok)throw Error("REVOKE_FAILED");
   await load();setMessage(t("تم إيقاف الوصول بنجاح.","Session access revoked.","Session révoquée."));
  }catch{setError(t("تعذر إنهاء الجلسة؛ حاول مجددًا.","Could not revoke the session. Try again.","Impossible de révoquer la session. Réessayez."));}
  finally{setBusy(false);}
 }
 const date=(value:string)=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString(language==="ar"?"ar-SA-u-nu-latn":language==="fr"?"fr-FR":"en-GB",{dateStyle:"medium",timeStyle:"short",numberingSystem:"latn"}):"—";};
 return <section className="customerSecurityCenter" id="customer-security-center" aria-labelledby="customer-security-title">
  <header><div><small>{t("أمان حسابك","Account security","Sécurité du compte")}</small><h2 id="customer-security-title">{t("الأجهزة والجلسات","Devices and sessions","Appareils et sessions")}</h2><p>{t("راجع الجلسات النشطة وأوقف وصول الأجهزة الأخرى. لا نعرض مواقع جغرافية تخمينية أو عنوان IP.","Review your sessions and sign out other devices. No guessed locations or IP addresses are displayed.","Consultez vos sessions sans divulguer IP ni localisation présumée.")}</p></div><button type="button" disabled={busy||loading} onClick={()=>{setLoading(true);setError("");void load().catch(()=>setError(t("تعذر التحديث.","Refresh failed.","Échec de l’actualisation."))).finally(()=>setLoading(false));}}>{t("تحديث","Refresh","Actualiser")}</button></header>
  {loading?<p role="status">{t("جارٍ تحميل الجلسات...","Loading sessions...","Chargement des sessions...")}</p>:<>
   {sessions.some(s=>!s.current)&&<button type="button" className="customerSecurityDanger" disabled={busy} onClick={()=>void revoke()}>{t("إنهاء جميع الجلسات الأخرى","Sign out all other sessions","Déconnecter les autres sessions")}</button>}
   <div className="customerSessionList">{sessions.map(session=><article key={session.id} data-current={session.current}><div><strong>{session.current?t("هذه جلستك الحالية","Current session","Session actuelle"):t("جلسة أخرى","Other session","Autre session")}</strong><small>{t("بدأت: ","Started: ","Début : ")}{date(session.createdAt)}</small><small>{t("آخر نشاط مسجل: ","Last recorded activity: ","Dernière activité : ")}{date(session.lastSeenAt)}</small></div>{!session.current&&<button disabled={busy} type="button" onClick={()=>void revoke(session.id)}>{t("إنهاء الجلسة","Sign out","Déconnecter")}</button>}</article>)}</div>
   {!sessions.length&&<p>{t("لا توجد جلسات نشطة.","No active sessions.","Aucune session active.")}</p>}
   {limited&&<p>{t("تظهر أحدث 60 جلسة؛ زر إنهاء الآخرين يشمل البقية أيضًا.","Latest 60 shown; Sign out others includes all.","60 dernières affichées ; déconnecter les autres inclut tout.")}</p>}
  </>}
  <p className="customerSecurityFootnote">{t("إنهاء جلسة لا يحذف الطلبات والحجوزات. تحديث كلمة المرور يتم من إعدادات الحساب.","Signing out a session never deletes orders or bookings. Password changes are managed separately.","La déconnexion ne supprime pas les commandes ni réservations.")}</p>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
