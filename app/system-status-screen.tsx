"use client";
import {useEffect,useState,useSyncExternalStore} from "react";
import Link from "next/link";
import {setUiLanguage} from "@/lib/i18n/ui-language";
import {localizedSystemStatus,systemLocale,type SystemLocale,type SystemStatus} from "@/lib/platform/system-status-copy";
import "./system-status.css";

type Props={status:SystemStatus;httpStatus?:number;error?:Error & {digest?:string};reset?:()=>void;source?:"app-error"|"global-error"|"not-found"|"maintenance"};
const serverLanguage=():SystemLocale=>"ar";
function readLanguage():SystemLocale{
 return systemLocale(document.cookie.match(/(?:^|;\s*)foon_language=(ar|en|fr)/)?.[1]??document.documentElement.lang);
}
function subscribeLanguage(notify:()=>void){
 window.addEventListener("foon:language-change",notify);
 return ()=>window.removeEventListener("foon:language-change",notify);
}
// The cookie is read via useSyncExternalStore to avoid hydration mismatch and
// synchronous setState in an effect (including the root global error boundary).
export default function SystemStatusScreen({status,httpStatus,error,reset,source}:Props){
 const language=useSyncExternalStore(subscribeLanguage,readLanguage,serverLanguage);
 const [reference,setReference]=useState(error?.digest??(status==="NOT_FOUND"?"HTTP-404":status==="MAINTENANCE"?"MAINT-503":"SYSTEM-ERROR"));
 useEffect(()=>{
  if(!error||error.digest)return;
  const bytes=new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const incidentId="WEB-"+Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("").toUpperCase();
  // Update only after the asynchronous log attempt; the reference remains
  // visible even if logging fails due to connectivity.
  void fetch("/api/system/client-incident",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({incidentId,source:source==="global-error"?"global-error":"app-error"}),keepalive:true})
   .catch(()=>{}).finally(()=>setReference(incidentId));
 },[error,source]);
 const t=localizedSystemStatus(language,status);
 const code=httpStatus??(status==="NOT_FOUND"?404:status==="BAD_GATEWAY"?502:status==="GATEWAY_TIMEOUT"?504:status==="SERVER_ERROR"?500:503);
 return <main className="foonSystemStatus" lang={language} dir={language==="ar"?"rtl":"ltr"}>
  <section className="foonSystemStatusCard" role={status==="NOT_FOUND"?"status":"alert"}>
   <div className="foonSystemStatusBrand">FOON</div>
   <div className="foonSystemStatusSymbol" aria-hidden="true">{status==="NOT_FOUND"?"⌕":status==="MAINTENANCE"?"⚙":"!"}</div>
   <h1>{t.title}</h1><p>{t.description}</p>
   <div className="foonSystemStatusActions">
    {status!=="NOT_FOUND"&&<button type="button" className="foonSystemStatusRetry" onClick={()=>reset?reset():window.location.reload()}>{t.retry}</button>}
    <Link className="foonSystemStatusHome" href="/">{t.home}</Link>
   </div>
   <div className="foonSystemStatusMeta"><span>{t.status}: <code>{code}</code></span><span>{t.reference}: <code data-testid="incident-reference">{reference}</code></span><p>{t.support}</p></div>
   <nav className="foonSystemStatusLanguages" aria-label="Language / اللغة / Langue">
    {(["ar","en","fr"] as const).map(l=><button key={l} type="button" aria-pressed={language===l} onClick={()=>setUiLanguage(l)}>{l==="ar"?"العربية":l==="en"?"EN":"FR"}</button>)}
   </nav>
  </section>
 </main>;
}
