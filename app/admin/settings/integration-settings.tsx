"use client";
import {useEffect,useState,type FormEvent} from "react";
type Integrations={recaptchaSiteKey:string;recaptchaRequested:boolean;aiProvider:"off"|"openai"|"other";aiModel:string;trackingConsentRequired:boolean};
const initial:Integrations={recaptchaSiteKey:"",recaptchaRequested:false,aiProvider:"off",aiModel:"",trackingConsentRequired:true};
type Environment={recaptchaSecretPresent:boolean;aiKeyPresent:boolean};
export default function IntegrationSettings({canEdit}:{canEdit:boolean}){
 const [settings,setSettings]=useState<Integrations>(initial);
 const [environment,setEnvironment]=useState<Environment|null>(null);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(""),[message,setMessage]=useState("");
 useEffect(()=>{let active=true;
  fetch("/api/admin/integrations",{cache:"no-store"})
   .then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.code);return j;})
   .then(j=>{if(active){setSettings(j.configuration);setEnvironment(j.environment);}})
   .catch(()=>{if(active)setError("تعذر قراءة إعدادات التكاملات.")})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[]);
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!canEdit)return;setError("");setMessage("");setSaving(true);
  try{
   const r=await fetch("/api/admin/integrations",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(settings)});
   const j=await r.json();if(!r.ok||!j.ok)throw Error(j.code||"SAVE_FAILED");
   setMessage("حُفظت إعدادات التكاملات. لا تُفعّل الحماية أو خدمة الذكاء الاصطناعي تلقائيًا دون ربط الخادم والتحقق منها.");
  }catch(e){setError("تعذر حفظ الإعدادات: "+(e instanceof Error?e.message:""))}
  finally{setSaving(false)}
 }
 return <section className="adminPanel adminOperationsPanel" aria-label="إعدادات الحماية والذكاء الاصطناعي والتتبع" dir="rtl">
  <h2>إعدادات reCAPTCHA والذكاء الاصطناعي والتحليلات</h2>
  <p className="adminOpsLead">تحكم مركزي لجميع أنشطة المطاعم والمتاجر. هذه حقول تهيئة فقط؛ لا يظهر النظام أنها حماية نشطة قبل توصيل التحقق في نماذج العملاء.</p>
  {loading?<p>جارٍ تحميل إعدادات التكاملات…</p>:
  <form className="adminOpsForm" onSubmit={e=>void save(e)}>
   <h3>إعدادات reCAPTCHA</h3>
   <label>المفتاح العام Site Key<input dir="ltr" autoComplete="off" maxLength={200} readOnly={!canEdit} placeholder="المفتاح العام من مزود CAPTCHA" value={settings.recaptchaSiteKey} onChange={e=>setSettings(v=>({...v,recaptchaSiteKey:e.target.value.trim()}))}/></label>
   <label><input type="checkbox" disabled={!canEdit} checked={settings.recaptchaRequested} onChange={e=>setSettings(v=>({...v,recaptchaRequested:e.target.checked}))}/> طلب تفعيل CAPTCHA لنماذج الموقع</label>
   <p role="note">سرّ reCAPTCHA لا يوضع في قاعدة البيانات أو متصفح العميل. يضبط في خادم Hostinger باسم RECAPTCHA_SECRET_KEY. حالة إعداد السرّ: <b>{environment?.recaptchaSecretPresent?"موجود":"غير مهيأ"}</b>. الحماية ليست مفعلة برمجيًا بمجرد الحفظ.</p>
   <h3>إعدادات الذكاء الاصطناعي</h3>
   <label>مزود الذكاء الاصطناعي
    <select value={settings.aiProvider} disabled={!canEdit} onChange={e=>setSettings(v=>({...v,aiProvider:e.target.value as Integrations["aiProvider"]}))}>
     <option value="off">معطل</option><option value="openai">OpenAI</option><option value="other">مزود آخر (تهيئة فقط)</option>
    </select>
   </label>
   <label>اسم النموذج<input dir="ltr" maxLength={80} value={settings.aiModel} readOnly={!canEdit} onChange={e=>setSettings(v=>({...v,aiModel:e.target.value}))} placeholder="اسم النموذج عند الربط"/></label>
   <p role="note">المفتاح السري للذكاء الاصطناعي محفوظ في بيئة الخادم فقط. حالة OPENAI_API_KEY: <b>{environment?.aiKeyPresent?"موجود":"غير مهيأ"}</b>. لا يُرسل محتوى العملاء لأي مزود بمجرد تهيئة هذا القسم.</p>
   <h3>الخصوصية والتحليلات</h3>
   <label><input type="checkbox" checked={settings.trackingConsentRequired} disabled={!canEdit} onChange={e=>setSettings(v=>({...v,trackingConsentRequired:e.target.checked}))}/> اشتراط موافقة العميل قبل تشغيل التتبع التسويقي</label>
   <p role="note">تُحفظ معرّفات Google Analytics وMeta Pixel لكل متجر من لوحة التاجر. لا يتم تحميل أدوات تتبع تلقائيًا دون تنفيذ موافقة الخصوصية.</p>
   {canEdit&&<button type="submit" className="adminOpsSubmit" disabled={saving}>{saving?"جارٍ الحفظ…":"حفظ إعدادات التكاملات"}</button>}
  </form>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </section>;
}
