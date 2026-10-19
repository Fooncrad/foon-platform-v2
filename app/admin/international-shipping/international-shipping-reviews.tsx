"use client";
import {useEffect,useState} from "react";
type RequestRow={tenant_id:string;name:string;slug:string;country_code:string;activity_code:string;status:string;requested_countries:string[]|string;approved_countries:string[]|string|null;requested_at:string};
const list=(raw:string[]|string|null):string[]=>{try{const v=typeof raw==="string"?JSON.parse(raw):raw;return Array.isArray(v)?v.filter(x=>typeof x==="string"):[]}catch{return []}};
export default function InternationalShippingReviews(){
 const [requests,setRequests]=useState<RequestRow[]>([]);
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 async function refresh(){
  const r=await fetch("/api/admin/international-shipping",{cache:"no-store"});
  if(!r.ok)throw new Error("LOAD_FAILED");
  const json=await r.json();
  setRequests(json.requests);
 }
 useEffect(()=>{let alive=true;fetch("/api/admin/international-shipping",{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(v=>{if(alive)setRequests(v.requests)}).catch(()=>{if(alive)setError("تعذر تحميل طلبات الشحن الدولي")});return()=>{alive=false}},[]);
 async function decide(tenantId:string,status:"approved"|"rejected"|"disabled"){
  if(!window.confirm(status==="approved"?"تأكيد الموافقة على دول الشحن المحددة؟":"تأكيد رفض أو إيقاف الشحن الدولي؟"))return;
  setBusy(tenantId);setError("");
  try{
   const r=await fetch("/api/admin/international-shipping",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tenantId,status})});
   if(!r.ok)throw Error();
   await refresh();
  }catch{setError("تعذر حفظ القرار. حاول مجددًا.")}finally{setBusy(null)}
 }
 return <section className="adminPanel" dir="rtl" aria-label="موافقات الشحن الدولي">
  <h2>موافقات البيع والشحن خارج الدولة</h2>
  <p>تقتصر الموافقات على الأنشطة المؤهلة. لا تشمل المطاعم والمقاهي. جميع الطلبات معلقة إلى أن يعتمد الأدمن الدول المحددة.</p>
  {error&&<p role="alert">{error}</p>}
  {requests.length===0?<p>لا توجد طلبات شحن دولي.</p>:<div style={{display:"grid",gap:12}}>{requests.map(row=><article key={row.tenant_id} style={{border:"1px solid #bbb",borderRadius:12,padding:16}}>
   <h3>{row.name} — {row.slug}</h3>
   <p>النشاط: {row.activity_code} · دولة المتجر: {row.country_code}</p>
   <p>الحالة: <strong>{row.status}</strong></p>
   <p>الدول المطلوبة: {list(row.requested_countries).join("، ")||"لا توجد"}</p>
   {row.status==="approved"&&<p>الدول المعتمدة: {list(row.approved_countries).join("، ")}</p>}
   <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
    {row.status==="pending"&&<><button type="button" disabled={busy===row.tenant_id} onClick={()=>void decide(row.tenant_id,"approved")}>موافقة</button><button type="button" disabled={busy===row.tenant_id} onClick={()=>void decide(row.tenant_id,"rejected")}>رفض</button></>}
    {row.status==="approved"&&<button type="button" disabled={busy===row.tenant_id} onClick={()=>void decide(row.tenant_id,"disabled")}>إيقاف الشحن الدولي</button>}
   </div>
  </article>)}</div>}
 </section>;
}