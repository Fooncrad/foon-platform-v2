"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export default function CreatePlanForm(){
 const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [success,setSuccess]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setBusy(true);setError("");setSuccess("");
  const form=event.currentTarget;const data=new FormData(form);
  try{const res=await fetch("/api/admin/plans",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:data.get("code"),name_ar:data.get("name_ar"),name_en:data.get("name_en"),name_fr:data.get("name_fr")})});
   const result=await res.json().catch(()=>({}));
   if(!res.ok){setError(result.code==="PLAN_CODE_EXISTS"?"رمز الباقة مستخدم مسبقًا.":result.code==="INVALID_INPUT"?"راجع رمز الباقة وأسماء اللغات الثلاث.":"تعذر إنشاء الباقة. رمز الخطأ: "+String(result.code??res.status));return;}
   form.reset();setSuccess("تم إنشاء الباقة.");router.refresh();
  }catch{setError("تعذر الاتصال بالخادم.");}finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="auth-form" style={{maxWidth:560}}>
  <label>رمز الباقة<input name="code" required pattern="[a-z][a-z0-9_-]{1,79}" placeholder="starter" dir="ltr"/></label>
  <label>الاسم بالعربية<input name="name_ar" required minLength={2} maxLength={180}/></label>
  <label>الاسم بالإنجليزية<input name="name_en" required minLength={2} maxLength={180} dir="ltr"/></label>
  <label>الاسم بالفرنسية<input name="name_fr" required minLength={2} maxLength={180} dir="ltr"/></label>
  {error&&<p role="alert" className="form-error">{error}</p>}{success&&<p role="status">{success}</p>}
  <button disabled={busy}>{busy?"جارٍ الحفظ…":"إنشاء الباقة"}</button>
 </form>;
}
