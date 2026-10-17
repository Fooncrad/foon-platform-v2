"use client";
import {useEffect,useState} from "react";
type Lang="ar"|"en"|"fr";
type RecordItem={id:string;name:string;status:string;requestType:string;createdAt:string;scheduledAt:string|null};
const copy={
 ar:{title:"متابعة طلبات الخدمات",pending:"بانتظار المراجعة",in_review:"قيد المراجعة",confirmed:"تم تأكيد الموعد",responded:"تم التواصل",declined:"مرفوض",completed:"مكتمل",cancelled:"ملغي",empty:"ليس لديك طلبات خدمات بعد.",error:"تعذر تحميل طلباتك.",refresh:"تحديث الحالة",appointment:"موعد",quote:"عرض سعر",inquiry:"استفسار"},
 en:{title:"Track service requests",pending:"Pending review",in_review:"Under review",confirmed:"Appointment confirmed",responded:"Followed up",declined:"Declined",completed:"Completed",cancelled:"Cancelled",empty:"No service requests yet.",error:"Unable to load your requests.",refresh:"Refresh status",appointment:"Appointment",quote:"Quotation inquiry",inquiry:"Inquiry"},
 fr:{title:"Suivi des demandes",pending:"En attente",in_review:"En cours",confirmed:"Rendez-vous confirmé",responded:"Suivi effectué",declined:"Refusé",completed:"Terminé",cancelled:"Annulé",empty:"Aucune demande pour le moment.",error:"Chargement impossible.",refresh:"Actualiser",appointment:"Rendez-vous",quote:"Demande de devis",inquiry:"Demande d’information"}
};
export default function ServiceRequestHistory({slug,language,visible}:{slug:string;language:Lang;visible:boolean}){
 const [rows,setRows]=useState<RecordItem[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const t=copy[language];
 const load=async()=>{const r=await fetch("/api/customer/service-requests?storeSlug="+encodeURIComponent(slug),{cache:"no-store"});const j=await r.json();if(r.status===403){setRows([]);setLoading(false);return;}if(!r.ok||!Array.isArray(j.requests))throw Error("LOAD_FAILED");setRows(j.requests);setError("");setLoading(false);};
 useEffect(()=>{if(!visible)return;let active=true;const read=async()=>{try{const r=await fetch("/api/customer/service-requests?storeSlug="+encodeURIComponent(slug),{cache:"no-store"});const j=await r.json();if(r.status===403){if(active)setRows([]);return;}if(!r.ok||!Array.isArray(j.requests))throw Error();if(active){setRows(j.requests);setError("");}}catch{if(active)setError(t.error)}finally{if(active)setLoading(false)}};
 void read();const handler=()=>void read();window.addEventListener("foon:service-request-sent",handler);return()=>{active=false;window.removeEventListener("foon:service-request-sent",handler);};
 },[visible,slug,t.error]);
 if(!visible)return null;
 return <section className="foonServiceRequestHistory" aria-label={t.title}>
  <header><h2>{t.title}</h2><button type="button" onClick={()=>void load().catch(()=>setError(t.error))}>{t.refresh}</button></header>
  {error&&<p role="alert">{error}</p>}
  {loading?<p>…</p>:rows.length?<div className="foonServiceHistoryList">{rows.map(r=><article key={r.id}><strong>{r.name}</strong><span>{t[r.requestType as "appointment"|"quote"|"inquiry"]??t.inquiry} · {t[r.status as keyof typeof t]??r.status}</span><small dir="ltr">{String(r.id).slice(0,8)}</small></article>)}</div>:<p>{t.empty}</p>}
 </section>;
}
