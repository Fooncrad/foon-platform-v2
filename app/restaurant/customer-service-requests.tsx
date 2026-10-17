"use client";
import {useCallback,useEffect,useState} from "react";
type Language="ar"|"en"|"fr";
type Row={id:string;name:string;branchId:string|null;requestType:string;status:string;version:number;customerName:string;customerPhone:string;notes:string;scheduledAt:string|null;createdAt:string};
const copy={
 ar:{title:"طلبات العملاء للخدمات",description:"طلبات المواعيد وعروض الأسعار والاستفسارات، تحتاج مراجعة النشاط.",empty:"لا توجد طلبات خدمات حاليًا.",failed:"تعذر تحميل أو تحديث طلبات الخدمات.",refresh:"تحديث الطلبات",review:"قيد المراجعة",confirm:"تأكيد الموعد",respond:"تم التواصل",decline:"رفض الطلب",finish:"إكمال الخدمة",cancel:"إلغاء الموعد",date:"الموعد المطلوب",status:"الحالة",phone:"الهاتف",notes:"التفاصيل",pending:"بانتظار المراجعة",in_review:"قيد المراجعة",confirmed:"مؤكد",responded:"تم التواصل",declined:"مرفوض",completed:"مكتمل",cancelled:"ملغى",appointment:"موعد",quote:"طلب عرض سعر",inquiry:"استفسار",emptyNotes:"دون تفاصيل",busy:"جارٍ الحفظ…"},
 en:{title:"Customer service requests",description:"Review appointment, quotation and inquiry requests.",empty:"No service requests yet.",failed:"Could not load or update requests.",refresh:"Refresh",review:"Under review",confirm:"Confirm appointment",respond:"Followed up",decline:"Decline",finish:"Complete",cancel:"Cancel appointment",date:"Requested time",status:"Status",phone:"Phone",notes:"Details",pending:"Pending",in_review:"Under review",confirmed:"Confirmed",responded:"Followed up",declined:"Declined",completed:"Completed",cancelled:"Cancelled",appointment:"Appointment",quote:"Quotation request",inquiry:"Inquiry",emptyNotes:"No details",busy:"Saving…"},
 fr:{title:"Demandes de services",description:"Examinez les demandes de rendez-vous, devis et renseignements.",empty:"Aucune demande.",failed:"Chargement ou mise à jour impossible.",refresh:"Actualiser",review:"En cours d’étude",confirm:"Confirmer le rendez-vous",respond:"Suivi effectué",decline:"Refuser",finish:"Terminer",cancel:"Annuler le rendez-vous",date:"Date souhaitée",status:"Statut",phone:"Téléphone",notes:"Détails",pending:"En attente",in_review:"En cours d’étude",confirmed:"Confirmé",responded:"Suivi effectué",declined:"Refusé",completed:"Terminé",cancelled:"Annulé",appointment:"Rendez-vous",quote:"Demande de devis",inquiry:"Demande d’information",emptyNotes:"Aucun détail",busy:"Enregistrement…"}
};
export default function CustomerServiceRequests({tenantId,branchId="",language="ar"}:{tenantId:string;branchId?:string;language?:Language}){
 const t=copy[language];const [rows,setRows]=useState<Row[]>([]),[busy,setBusy]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  const suffix=branchId?"?branch="+encodeURIComponent(branchId):"";
  const r=await fetch("/api/restaurant/service-requests"+suffix,{cache:"no-store",headers:{"x-foon-tenant":tenantId}});
  const j=await r.json();
  if(!r.ok||!Array.isArray(j.requests))throw Error(j.code??"INVALID_REQUESTS");
  setRows(j.requests);
 },[tenantId,branchId]);
 useEffect(()=>{let alive=true;const suffix=branchId?"?branch="+encodeURIComponent(branchId):"";
  fetch("/api/restaurant/service-requests"+suffix,{cache:"no-store",headers:{"x-foon-tenant":tenantId}}).then(async r=>{const j=await r.json();if(!r.ok||!Array.isArray(j.requests))throw Error(j.code??"LOAD_FAILED");if(alive)setRows(j.requests);}).catch(()=>{if(alive)setError(t.failed);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[tenantId,branchId,t.failed]);
 async function update(row:Row,status:string){
  if(busy)return;setBusy(row.id);setError("");
  try{
   const r=await fetch("/api/restaurant/service-requests",{method:"PATCH",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({id:row.id,status,version:row.version})});
   if(!r.ok)throw Error("SAVE_FAILED");
   await load();
  }catch{setError(t.failed)}finally{setBusy("")}
 }
 const next=(r:Row):[string,string][]=>r.status==="pending"||r.status==="in_review"?[
  ...(r.status==="pending"?[["in_review",t.review] as [string,string]]:[]),
  [r.requestType==="appointment"?"confirmed":"responded",r.requestType==="appointment"?t.confirm:t.respond],["declined",t.decline]
 ]:r.status==="confirmed"?[["completed",t.finish],["cancelled",t.cancel]]:[];
 return <section className="restaurantPanel foonServiceCustomerInbox" dir={language==="ar"?"rtl":"ltr"} aria-label={t.title}>
  <header><div><h3>{t.title}</h3><p>{t.description}</p></div><button className="restaurantOutline" type="button" onClick={()=>void load().catch(()=>setError(t.failed))}>{t.refresh}</button></header>
  {error&&<p role="alert">{error}</p>}
  {loading?<p role="status">{t.busy}</p>:!rows.length?<p>{t.empty}</p>:<div className="foonServiceCustomerGrid">
   {rows.map(row=><article key={row.id} className="foonServiceCustomerCard">
    <header><div><strong>{row.name}</strong><p>{t[row.requestType as "appointment"|"quote"|"inquiry"]??t.inquiry} · {row.customerName}</p></div><small>{t[row.status as keyof typeof t]??row.status}</small></header>
    <p>{t.phone}: <a dir="ltr" href={"tel:"+row.customerPhone.replace(/[^0-9+]/g,"")}>{row.customerPhone}</a></p>
    <p>{t.notes}: {row.notes||t.emptyNotes}</p>
    {row.scheduledAt&&<p>{t.date}: <time dateTime={row.scheduledAt}>{new Date(row.scheduledAt).toLocaleString(language==="ar"?"ar-SA-u-nu-latn":language==="fr"?"fr-FR":"en-GB")}</time></p>}
    <div className="foonServiceRequestButtons">{next(row).map(([status,label])=><button type="button" key={status} disabled={Boolean(busy)} onClick={()=>void update(row,status)}>{busy===row.id?t.busy:label}</button>)}</div>
   </article>)}
  </div>}
 </section>;
}
