"use client";
import {useEffect,useState,type FormEvent} from "react";
type Settings={mode:"platform"|"custom";host:string;port:number;user:string;fromName:string;passwordSet:boolean;platformConfigured:boolean};
export default function MerchantMailSettings({tenantId}:{tenantId:string}){
 const [settings,setSettings]=useState<Settings|null>(null),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{let active=true;fetch("/api/restaurant/mail-settings",{headers:{"x-foon-tenant":tenantId}}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.code);if(active)setSettings(data);}).catch(e=>{if(active)setMessage(String(e));});return()=>{active=false;};},[tenantId]);
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!settings)return;setBusy(true);setMessage("");
 try{const response=await fetch("/api/restaurant/mail-settings",{method:"PUT",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({...settings,password})});const result=await response.json();if(!response.ok)throw Error(result.code);setPassword("");setSettings(s=>s?{...s,passwordSet:s.passwordSet||Boolean(password)}:s);setMessage("تم حفظ إعداد البريد.");}catch(e){setMessage("تعذر الحفظ: "+String(e));}finally{setBusy(false);}}
 return <section className="restaurantPanel"><header><div><h3>بريد الموظفين والإشعارات</h3><p>تستخدم منشأتك بريد منصة FOON تلقائيًا. بيانات المنصة وكلمة مرورها غير ظاهرة للمتاجر.</p></div></header>
 {!settings?<p>{message||"جارٍ تحميل الإعدادات…"}</p>:<form onSubmit={save} style={{display:"grid",gap:12,padding:16,maxWidth:720}}>
 <label>طريقة إرسال البريد<select value={settings.mode} onChange={e=>setSettings(s=>s?{...s,mode:e.target.value as Settings["mode"]}:s)}><option value="platform">بريد المنصة (افتراضي)</option><option value="custom">استخدام بريد خاص بالمنشأة</option></select></label>
 {settings.mode==="platform"?<p role="status">{settings.platformConfigured?"تم ضبط بريد المنصة على الخادم؛ لا يُعرض اسم المستخدم أو كلمة المرور.":"إعداد بريد المنصة غير مكتمل؛ تواصل مع مسؤول المنصة."}</p>:<>
 <p>إعدادات SMTP الخاصة بك تُحفظ مشفرة، وتُستخدم لهذه المنشأة فقط. الاتصال SSL/TLS على المنفذ 465.</p>
 <label>خادم SMTP<input required dir="ltr" value={settings.host} placeholder="smtp.example.com" onChange={e=>setSettings(s=>s?{...s,host:e.target.value}:s)}/></label>
 <label>البريد الإلكتروني المرسل / اسم المستخدم<input required type="email" dir="ltr" value={settings.user} onChange={e=>setSettings(s=>s?{...s,user:e.target.value}:s)}/></label>
 <label>اسم المرسل<input value={settings.fromName} maxLength={160} onChange={e=>setSettings(s=>s?{...s,fromName:e.target.value}:s)}/></label>
 <label>كلمة مرور بريد SMTP<input type="password" autoComplete="new-password" value={password} placeholder={settings.passwordSet?"اتركها فارغة للإبقاء على المحفوظ":"أدخل كلمة مرور بريدك"} onChange={e=>setPassword(e.target.value)}/></label>
 </>}
 <button type="submit" className="restaurantPrimary" disabled={busy}>{busy?"جارٍ الحفظ…":"حفظ إعدادات البريد"}</button>{message&&<p role="status">{message}</p>}
 </form>}</section>;
}
