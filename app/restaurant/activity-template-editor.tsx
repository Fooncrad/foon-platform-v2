"use client";
import styles from "./catalog-manager.module.css";
import {useUiLanguage,useUiText} from "@/lib/i18n/ui-language";
import {useEffect,useState} from "react";
import {templatesForActivity} from "@/lib/platform/activity-templates";
export default function ActivityTemplateEditor({tenantId,activity,slug}:{tenantId:string;activity:string;slug:string}){
 const translateUi=useUiText(),language=useUiLanguage();
 const t=(a:string,b:string,c:string)=>language==="ar"?a:language==="en"?b:c;
 const messages:Record<string,[string,string]>={
 "نوع النشاط في الاستجابة لا يطابق النشاط الحالي. أعد تحميل الصفحة.":["Business activity changed. Reload this page.","L’activité a changé. Rechargez cette page."],
 "القالب المحفوظ غير متاح لهذا النشاط. اختر قالبًا مناسبًا ثم احفظه.":["Choose and save an available template for this activity.","Choisissez et enregistrez un modèle disponible pour cette activité."],
 "تعذر تحميل إعدادات القوالب. تأكد من ترحيل قاعدة البيانات.":["Template settings are unavailable. Ask the administrator to check database migrations.","Modèles indisponibles. Demandez à l’administrateur de vérifier les migrations."],
 "تم حفظ قالب النشاط بنجاح.":["Business template saved.","Modèle enregistré."],
 "تعذر حفظ القالب. حاول مجددًا.":["Unable to save the template. Retry.","Impossible d’enregistrer le modèle. Réessayez."]};


 const choices=templatesForActivity(activity);
 const [selected,setSelected]=useState<string>(choices[0]??"");
 const [saved,setSaved]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState("");
 const messageText=language==="ar"?message:messages[message]?.[language==="en"?0:1]??message;
 useEffect(()=>{let live=true;fetch("/api/restaurant/activity-template",{headers:{"x-foon-tenant":tenantId},cache:"no-store"}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(live){if(d.activity!==activity){setMessage("نوع النشاط في الاستجابة لا يطابق النشاط الحالي. أعد تحميل الصفحة.");setLoading(false);return}if(typeof d.template==="string"&&choices.includes(d.template)){setSelected(d.template);setSaved(d.template)}else{setSelected(choices[0]??"");setSaved("");setMessage("القالب المحفوظ غير متاح لهذا النشاط. اختر قالبًا مناسبًا ثم احفظه.")}setLoading(false)}}).catch(()=>{if(live){setMessage("تعذر تحميل إعدادات القوالب. تأكد من ترحيل قاعدة البيانات.");setLoading(false)}});return()=>{live=false}},[tenantId,activity]);
 async function save(){if(!choices.includes(selected))return;setBusy(true);setMessage("");try{const r=await fetch("/api/restaurant/activity-template",{method:"PUT",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({template:selected})});if(!r.ok)throw Error();setSaved(selected);setMessage("تم حفظ قالب النشاط بنجاح.")}catch{setMessage("تعذر حفظ القالب. حاول مجددًا.")}finally{setBusy(false)}}
 return <section className={"restaurantPanel "+styles.manager} style={{padding:20}}>
  <h2>{translateUi("قوالب واجهة النشاط")}</h2><p>{translateUi("اختر قالبًا مخصصًا لنشاطك. التغيير لا يؤثر على بيانات المنتجات أو العملاء.")}</p>
  <div role="radiogroup" aria-label={t("قوالب النشاط","Activity templates","Modèles de l’activité")} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:16}}>
   {choices.map((key,i)=><label key={key} style={{border:selected===key?"2px solid #b88732":"1px solid #ccd5df",borderRadius:14,padding:16,cursor:"pointer"}}>
    <input type="radio" name="activity-template" value={key} checked={selected===key} disabled={busy||loading} onChange={()=>setSelected(key)}/>
    <div aria-hidden="true" style={{display:"grid",gridTemplateColumns:i%2?"1fr":"repeat(3,1fr)",gap:8,background:"#eef2f7",padding:12,borderRadius:10,margin:"12px 0"}}>{Array.from({length:i%2?3:6},(_,n)=><span key={n} style={{display:"block",height:i%2?32:42,background:i%2?"linear-gradient(90deg,#a6cfc5 25%,white 25%)":"linear-gradient(#c4b4db 60%,white 60%)",borderRadius:6}}/>)}</div>
    <strong>{t(i%2?"عرض تفصيلي وقائمة":"شبكة بطاقات",i%2?"Detailed list":"Card grid",i%2?"Liste détaillée":"Grille de cartes")}</strong>
   </label>)}
  </div>
  <div style={{display:"flex",gap:12,alignItems:"center",marginTop:20,flexWrap:"wrap"}}>
   <button type="button" className="restaurantPrimary" onClick={()=>void save()} disabled={busy||loading||!choices.includes(selected)||selected===saved}>{busy?translateUi("جارٍ الحفظ…"):translateUi("حفظ القالب")}</button>
   {!loading&&choices.includes(selected)&&slug&&<a href={"/"+encodeURIComponent(slug)+"?previewTemplate="+encodeURIComponent(selected)} target="_blank" rel="noopener noreferrer">{translateUi("معاينة القالب المحدد قبل الحفظ")}</a>}
  </div>
  {message&&<p role="status">{messageText}</p>}
 </section>;
}
