"use client";
import {useEffect,useState} from "react";
const templates=[{id:"sufra",name:"السفرة",description:"داكن بلمسات ذهبية"},{id:"classic",name:"الكلاسيكي",description:"ألوان دافئة"},{id:"modern",name:"العصري",description:"أزرق بتصميم حديث"},{id:"minimal",name:"البسيط",description:"أبيض ونظيف"}] as const;
type Template=typeof templates[number]["id"];
export default function TemplateEditor({tenantId}:{tenantId:string}){
 const [selected,setSelected]=useState<Template>("sufra");
 const [saved,setSaved]=useState<Template>("sufra");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [message,setMessage]=useState("");
 useEffect(()=>{let cancelled=false;async function load(){
 try{const r=await fetch("/api/restaurant/menu/appearance",{headers:{"x-foon-tenant":tenantId},cache:"no-store"});const data=await r.json();if(!r.ok)throw Error("LOAD");if(!cancelled&&templates.some(t=>t.id===data.template)){setSelected(data.template);setSaved(data.template)}}catch{if(!cancelled)setMessage("تعذر تحميل القالب الحالي. تأكد من ترحيل قاعدة البيانات.")}finally{if(!cancelled)setLoading(false)}
 }void load();return()=>{cancelled=true}},[tenantId]);
 async function save(){if(busy||loading)return;setBusy(true);setMessage("");
 try{const r=await fetch("/api/restaurant/menu/appearance",{method:"PUT",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({template:selected})});if(!r.ok)throw Error("SAVE");setSaved(selected);setMessage("تم حفظ القالب. حدّث صفحة المطعم لمشاهدة التغيير.")}catch{setMessage("تعذر حفظ القالب. حاول مجددًا.")}finally{setBusy(false)}}
 return <section className="adminPanel"><h2>قالب منيو المطعم</h2><p>اختر التصميم المناسب لمطعمك أو مقهاك. لن يتغير تصميم المتاجر الأخرى.</p><div className="foonTemplateChoices" role="radiogroup" aria-label="قالب المنيو">{templates.map(t=><label key={t.id} className={"foonTemplateChoice foonTemplateChoice-"+t.id}><input type="radio" name="menu-template" value={t.id} checked={selected===t.id} disabled={loading} onChange={()=>{setSelected(t.id);setMessage("")}}/><strong>{t.name}</strong><span>{t.description}</span></label>)}</div><button className="foonTemplateSave" disabled={busy||loading||selected===saved} onClick={save}>{busy?"جارٍ الحفظ…":"حفظ القالب"}</button>{message&&<p role="status">{message}</p>}</section>;
}
