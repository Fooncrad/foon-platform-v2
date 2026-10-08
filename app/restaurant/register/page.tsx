"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RestaurantRegisterPage(){
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  setBusy(true);setError("");
  const data=new FormData(event.currentTarget);
  try{
   const response=await fetch("/api/restaurant/onboard",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:data.get("name"),slug:data.get("slug"),kind:data.get("kind")})});
   const result=await response.json().catch(()=>({}));
   if(response.ok){router.replace("/restaurant");router.refresh();return;}
   if(response.status===401){router.push("/login");return;}
   setError(result.code==="SLUG_EXISTS"?"الرابط مستخدم، اختر رابطًا آخر.":result.code==="INVALID_INPUT"?"راجع اسم النشاط والرابط (أحرف إنجليزية صغيرة وأرقام وشرطة).":"تعذر إنشاء النشاط. حاول مجددًا.");
  }catch{setError("تعذر الاتصال بالخادم. حاول مجددًا.");}
  finally{setBusy(false);}
 }
 return <main className="auth-shell" dir="rtl"><section className="auth-card">
  <Link href="/" className="auth-brand">FOON</Link>
  <h1>تسجيل مطعم أو متجر</h1>
  <p>أنشئ نشاطك وفرعك الرئيسي، ثم انتقل إلى لوحة التشغيل. يجب تسجيل الدخول بحسابك أولًا.</p>
  <form className="auth-form" onSubmit={submit}>
   <label>نوع النشاط<select name="kind" defaultValue="restaurant"><option value="restaurant">مطعم</option><option value="store">متجر</option></select></label>
   <label>اسم النشاط<input name="name" required minLength={2} maxLength={180} placeholder="اسم المطعم أو المتجر"/></label>
   <label>الرابط المختصر<input name="slug" required minLength={3} maxLength={120} pattern="[a-z0-9][a-z0-9-]{1,118}[a-z0-9]" dir="ltr" placeholder="my-restaurant"/><small>أحرف إنجليزية صغيرة وأرقام وشرطة (-)</small></label>
   {error&&<div className="form-error" role="alert">{error}</div>}
   <button disabled={busy}>{busy?"جارٍ إنشاء النشاط…":"إنشاء النشاط والفرع الرئيسي"}</button>
  </form>
  <p className="auth-switch"><Link href="/register">إنشاء حساب جديد</Link> · <Link href="/login">تسجيل الدخول</Link> · <Link href="/restaurant">لوحة المطعم</Link></p>
 </section></main>;
}
