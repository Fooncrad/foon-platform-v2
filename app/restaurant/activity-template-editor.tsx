"use client";
import {useEffect,useState} from "react";
import {templatesForActivity} from "@/lib/platform/activity-templates";
export default function ActivityTemplateEditor({tenantId,activity,slug}:{tenantId:string;activity:string;slug:string}){
 const choices=templatesForActivity(activity);
 const [selected,setSelected]=useState<string>(choices[0]??"");
 const [saved,setSaved]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState("");
 useEffect(()=>{let live=true;fetch("/api/restaurant/activity-template",{headers:{"x-foon-tenant":tenantId},cache:"no-store"}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(live){setSelected(d.template);setSaved(d.template);setLoading(false)}}).catch(()=>{if(live){setMessage("تعذر تحميل إعدادات القوالب. تأكد من ترحيل قاعدة البيانات.");setLoading(false)}});return()=>{live=false}},[tenantId]);
 async function save(){setBusy(true);setMessage("");try{const r=await fetch("/api/restaurant/activity-template",{method:"PUT",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({template:selected})});if(!r.ok)throw Error();setSaved(selected);setMessage("تم حفظ قالب النشاط بنجاح.")}catch{setMessage("تعذر حفظ القالب. حاول مجددًا.")}finally{setBusy(false)}}
 return <section className="restaurantPanel" style={{padding:20}}>
  <h2>قوالب واجهة النشاط</h2><p>اختر قالبًا مخصصًا لنشاطك. التغيير لا يؤثر على بيانات المنتجات أو العملاء.</p>
  <div role="radiogroup" aria-label="قوالب النشاط" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:16}}>
   {choices.map((key,i)=><label key={key} style={{border:selected===key?"2px solid #b88732":"1px solid #ccd5df",borderRadius:14,padding:16,cursor:"pointer"}}>
    <input type="radio" name="activity-template" value={key} checked={selected===key} disabled={busy||loading} onChange={()=>setSelected(key)}/>
    <div aria-hidden="true" style={{height:105,background:i%2?"linear-gradient(120deg,#e8f2f0,#a6cfc5)":"linear-gradient(120deg,#f4e5dc,#c4b4db)",borderRadius:10,margin:"12px 0"}}/>
    <strong>{key.split("-").join(" ")}</strong>
   </label>)}
  </div>
  <div style={{display:"flex",gap:12,alignItems:"center",marginTop:20,flexWrap:"wrap"}}>
   <button type="button" className="restaurantPrimary" onClick={()=>void save()} disabled={busy||loading||!selected||selected===saved}>{busy?"جارٍ الحفظ…":"حفظ القالب"}</button>
   <a href={"/"+encodeURIComponent(slug)+"?previewTemplate="+encodeURIComponent(selected)} target="_blank" rel="noopener noreferrer">معاينة القالب المحدد قبل الحفظ</a>
  </div>
  {message&&<p role="status">{message}</p>}
 </section>;
}
