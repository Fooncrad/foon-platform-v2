"use client";
import {useEffect,useState} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import {defaultLocationSettings,type TenantLocationSettings} from "@/lib/tenant/free-location";
type FormState={deliveryMode:"manual"|"radius";latitude:string;longitude:string;radiusKm:string;outsideMessage:string;googleAnalyticsId:string;facebookPixelId:string;aiAssistantRequested:boolean};
const fromSettings=(s:TenantLocationSettings):FormState=>({
 deliveryMode:s.deliveryMode,latitude:s.latitude===null?"":String(s.latitude),
 longitude:s.longitude===null?"":String(s.longitude),radiusKm:s.radiusKm===null?"":String(s.radiusKm),
 outsideMessage:s.outsideMessage,googleAnalyticsId:s.googleAnalyticsId,
 facebookPixelId:s.facebookPixelId,aiAssistantRequested:s.aiAssistantRequested
});
export default function FreeLocationSettings({tenantId}:{tenantId:string}){
 const language=useUiLanguage();
 const tr=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const [values,setValues]=useState<FormState>(fromSettings(defaultLocationSettings));
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(""),[message,setMessage]=useState("");
 const [locating,setLocating]=useState(false);
 useEffect(()=>{
  let live=true;setLoading(true);
  fetch("/api/restaurant/location-settings",{headers:{"x-foon-tenant":tenantId},cache:"no-store"})
   .then(async r=>{const j=await r.json();if(!r.ok||!j.ok)throw Error(j.code);return j;})
   .then(j=>{if(live){setValues(fromSettings(j.settings));setError("");}})
   .catch(()=>{if(live)setError(tr("تعذر قراءة إعدادات الموقع؛ تأكد من تطبيق ترحيل 0105.","Location settings unavailable; check migration 0105.","Paramètres indisponibles ; vérifiez la migration 0105."));})
   .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false};
 },[tenantId]);
 const update=(key:keyof FormState,value:string|boolean)=>setValues(v=>({...v,[key]:value}));
 function capture(){
  if(!navigator.geolocation){setError(tr("الموقع غير مدعوم في هذا الجهاز.","Geolocation is unsupported.","Géolocalisation indisponible."));return;}
  setLocating(true);setError("");
  navigator.geolocation.getCurrentPosition(
   pos=>{setValues(v=>({...v,latitude:pos.coords.latitude.toFixed(7),longitude:pos.coords.longitude.toFixed(7)}));setLocating(false);setMessage(tr("تم تحديد إحداثيات مركز التوصيل، راجعها ثم احفظ.","Location received. Review coordinates and save.","Position reçue. Vérifiez puis enregistrez."));},
   ()=>{setError(tr("لم يُسمح بالموقع. يمكنك إدخال الإحداثيات يدويًا.","Location denied. Enter coordinates manually.","Accès refusé. Saisissez les coordonnées."));setLocating(false);},
   {enableHighAccuracy:true,timeout:12000,maximumAge:0}
  );
 }
 async function save(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setError("");setMessage("");setSaving(true);
  const parsed={
   ...values,
   latitude:values.latitude.trim()===""?null:Number(values.latitude),
   longitude:values.longitude.trim()===""?null:Number(values.longitude),
   radiusKm:values.radiusKm.trim()===""?null:Number(values.radiusKm)
  };
  try{
   const r=await fetch("/api/restaurant/location-settings",{method:"PUT",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify(parsed)});
   const j=await r.json();if(!r.ok||!j.ok)throw Error(j.code||"SAVE_FAILED");
   setValues(fromSettings(j.settings));setMessage(tr("تم حفظ إعدادات الموقع والخيارات الاختيارية.","Settings saved.","Paramètres enregistrés."));
  }catch(e){setError(tr("تعذر الحفظ: ","Unable to save: ","Enregistrement impossible : ")+(e instanceof Error?e.message:""));}
  finally{setSaving(false);}
 }
 const lat=Number(values.latitude),lng=Number(values.longitude),hasCoordinates=values.latitude.trim()!==""&&values.longitude.trim()!==""&&Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180;
 const mapUrl=hasCoordinates?"https://www.openstreetmap.org/?mlat="+encodeURIComponent(lat)+"&mlon="+encodeURIComponent(lng)+"#map=15/"+encodeURIComponent(lat)+"/"+encodeURIComponent(lng):"";
 return <section className="restaurantPanel foonLocationSettings" aria-label={tr("إعدادات الموقع والشحن والتحليلات","Location, shipping and analytics","Localisation, livraison et analyses")} style={{marginBlock:16}}>
  <header><div><h3>{tr("الموقع المجاني ونطاق التوصيل","Free location and delivery radius","Localisation gratuite et rayon de livraison")}</h3>
   <p>{tr("استخدم GPS بإذن صاحب الجهاز، أو أدخل خط العرض وخط الطول. الخريطة من OpenStreetMap ولا تحتاج مفتاح Google أو رسوم استخدام.","Use browser GPS with permission or enter coordinates. OpenStreetMap requires no Google API key.","Utilisez le GPS avec autorisation ou saisissez les coordonnées. Aucune clé Google requise.")}</p></div></header>
  {loading?<p>{tr("جارٍ التحميل…","Loading…","Chargement…")}</p>:
  <form onSubmit={e=>void save(e)} style={{display:"grid",gap:14}}>
   <fieldset style={{display:"flex",flexWrap:"wrap",gap:16,border:"1px solid var(--rc-border,#ccd3dc)",padding:12,borderRadius:10}}>
    <legend>{tr("طريقة تحديد منطقة التوصيل","Delivery zone mode","Mode de livraison")}</legend>
    <label><input type="radio" checked={values.deliveryMode==="manual"} onChange={()=>update("deliveryMode","manual")}/>{tr("يدوي / دون حد للمسافة","Manual / no distance limit","Manuel / sans rayon")}</label>
    <label><input type="radio" checked={values.deliveryMode==="radius"} onChange={()=>update("deliveryMode","radius")}/>{tr("داخل نصف القطر","Within radius","Dans un rayon")}</label>
   </fieldset>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:12}}>
    <label>{tr("خط العرض Latitude","Latitude","Latitude")}<input inputMode="decimal" dir="ltr" aria-label="Latitude" value={values.latitude} onChange={e=>update("latitude",e.target.value)} placeholder="24.7136000"/></label>
    <label>{tr("خط الطول Longitude","Longitude","Longitude")}<input inputMode="decimal" dir="ltr" aria-label="Longitude" value={values.longitude} onChange={e=>update("longitude",e.target.value)} placeholder="46.6753000"/></label>
    <label>{tr("نصف القطر بالكيلومتر","Radius in kilometers","Rayon en kilomètres")}<input inputMode="decimal" dir="ltr" aria-label={tr("نصف القطر بالكيلومتر","Radius in kilometers","Rayon en kilomètres")} value={values.radiusKm} onChange={e=>update("radiusKm",e.target.value)} placeholder="10" required={values.deliveryMode==="radius"}/></label>
   </div>
   <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
    <button type="button" disabled={locating||saving} onClick={capture}>{locating?tr("جارٍ تحديد الموقع…","Locating…","Localisation…"):tr("استخدام موقعي الحالي مجانًا","Use my current location free","Utiliser ma position gratuitement")}</button>
    {mapUrl&&<a target="_blank" rel="noopener noreferrer" href={mapUrl}>{tr("عرض الإحداثيات على OpenStreetMap","View on OpenStreetMap","Voir sur OpenStreetMap")}</a>}
   </div>
   <label>{tr("رسالة خارج نطاق التوصيل","Outside delivery zone message","Message hors zone")}<textarea maxLength={240} value={values.outsideMessage} onChange={e=>update("outsideMessage",e.target.value)} rows={2} placeholder={tr("عذرًا، موقعك خارج نطاق التوصيل المحدد.","Sorry, your address is outside the delivery radius.","Votre adresse est hors de la zone de livraison.")}/></label>
   <p style={{fontSize:12,opacity:.88}}>{tr("المسافة خط مستقيم تقريبية وليست مسافة طريق. عند تفعيل نصف القطر يجب مشاركة إحداثيات العميل لتأكيد طلب التوصيل، مع إبقاء العنوان اليدوي؛ قد لا يتوفر GPS لدى جميع العملاء.","Radius is straight-line distance, not driving distance. Radius mode requires customer GPS for delivery checkout; manual address remains available.","Distance à vol d’oiseau, pas routière. Le GPS client est requis en mode rayon.")}</p>
   <h4>{tr("التحليلات والذكاء الاصطناعي (إعدادات اختيارية)","Analytics and AI (optional settings)","Analyses et IA (facultatif)")}</h4>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))",gap:12}}>
    <label>{tr("معرف Google Analytics (G-...)","Google Analytics ID (G-...)","Identifiant Google Analytics")}<input dir="ltr" maxLength={32} value={values.googleAnalyticsId} onChange={e=>update("googleAnalyticsId",e.target.value)} placeholder="G-XXXXXXXXXX"/></label>
    <label>{tr("معرف Facebook Pixel","Facebook Pixel ID","Identifiant Meta Pixel")}<input dir="ltr" inputMode="numeric" maxLength={25} value={values.facebookPixelId} onChange={e=>update("facebookPixelId",e.target.value)} placeholder="123456789012345"/></label>
   </div>
   <label><input type="checkbox" checked={values.aiAssistantRequested} onChange={e=>update("aiAssistantRequested",e.target.checked)}/>{tr("طلب تفعيل مساعد ذكاء اصطناعي للنشاط","Request AI assistant activation","Demander l’assistant IA")}</label>
   <p style={{fontSize:12,opacity:.88}}>{tr("حفظ معرّفات التتبع أو طلب مساعد الذكاء الاصطناعي لا يشغّلها تلقائيًا: يلزم تكامل التتبع وموافقة الخصوصية أو إعداد مزود الذكاء الاصطناعي من الأدمن. مفاتيح السر لا تُحفظ هنا.","Saving tracking IDs/AI request does not activate scripts or an AI model. Tracking consent and admin provider setup are still required.","L’enregistrement n’active ni les scripts de suivi ni l’IA sans intégration et consentement.")}</p>
   <button className="restaurantPrimary" disabled={saving}>{saving?tr("جارٍ الحفظ…","Saving…","Enregistrement…"):tr("حفظ الإعدادات","Save settings","Enregistrer")}</button>
  </form>}
  {error&&<p role="alert">{error}</p>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
