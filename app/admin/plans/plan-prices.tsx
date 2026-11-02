"use client";
import {useUiText} from "@/lib/i18n/ui-language";
import { useEffect, useState, type FormEvent } from "react";
type Price={id:string;billing_cycle:string;currency:string;price:string|number;enabled:boolean};
export default function PlanPrices({planId,canEdit,isFree=false}:{planId:string;canEdit:boolean;isFree?:boolean}){
 const translateUi=useUiText();

 const [prices,setPrices]=useState<Price[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [success,setSuccess]=useState("");const [busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;fetch("/api/admin/plans/"+encodeURIComponent(planId)+"/prices").then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.code??"PRICES_UNAVAILABLE");if(alive)setPrices(d.prices??[]);}).catch(e=>{if(alive)setError(String(e.message));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[planId]);
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setError("");setSuccess("");const form=new FormData(e.currentTarget);
  const data={billing_cycle:String(form.get("billing_cycle")),currency:String(form.get("currency")).toUpperCase(),price:Number(form.get("price")),enabled:form.get("enabled")==="on"};
  try{const res=await fetch("/api/admin/plans/"+encodeURIComponent(planId)+"/prices",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(data)});const result=await res.json().catch(()=>({}));if(!res.ok)throw new Error(result.code==="FREE_PLAN_MUST_BE_ZERO"?translateUi("سعر الباقة المجانية يجب أن يساوي صفرًا."):result.code??"SAVE_FAILED");
   const next=await fetch("/api/admin/plans/"+encodeURIComponent(planId)+"/prices");const json=await next.json();if(next.ok)setPrices(json.prices??[]);setSuccess("تم حفظ السعر.");}
  catch(e){setError(e instanceof Error?e.message:"SAVE_FAILED");}finally{setBusy(false);}
 }
 return <section><h3>{translateUi("أسعار الباقة")}</h3>{loading?<p>{translateUi("جارٍ التحميل…")}</p>:prices.length?<ul>{prices.map(p=><li key={p.id}>{p.billing_cycle==="monthly"?translateUi("شهري"):translateUi("سنوي")} · {p.currency} · {p.price} · {p.enabled?translateUi("مفعّل"):translateUi("معطّل")}</li>)}</ul>:<p>{translateUi("لا توجد أسعار مسجلة.")}</p>}
 {canEdit&&<form onSubmit={save} className="auth-form" style={{maxWidth:420}}>
 <label>{translateUi("دورة الفوترة")}<select name="billing_cycle"><option value="monthly">{translateUi("شهري")}</option><option value="yearly">{translateUi("سنوي")}</option></select></label>
 <label>{translateUi("العملة")}<input name="currency" defaultValue="SAR" required pattern="[A-Z]{3}" maxLength={3} dir="ltr"/></label>
 <label>{translateUi("السعر")}{isFree&&<small>{translateUi("الباقة المجانية سعرها صفر دائمًا، ويمكن تخصيص حدودها حسب النشاط.")}</small>}<input name="price" type="number" readOnly={isFree} defaultValue={isFree?"0":undefined} min="0" max="9999999999.99" step="0.01" required dir="ltr"/></label>
 <label><input name="enabled" type="checkbox" defaultChecked/>  {translateUi("تفعيل السعر")}</label>
 <button disabled={busy}>{busy?translateUi("جارٍ الحفظ…"):"حفظ السعر"}</button></form>}
 {error&&<p role="alert" className="form-error">{error}</p>}{success&&<p role="status">{success}</p>}</section>;
}
