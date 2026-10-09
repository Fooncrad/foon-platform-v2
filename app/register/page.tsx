"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage(){
 const router=useRouter(); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setError("");const data=new FormData(e.currentTarget);
  try{
   const res=await fetch("/api/auth/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:data.get("name"),email:data.get("email"),password:data.get("password"),storeName:data.get("storeName"),slug:data.get("slug"),kind:data.get("kind")})}); const body=await res.json().catch(()=>({}));
   if(!res.ok){setError(body.code==="EMAIL_EXISTS"?"هذا البريد مسجل مسبقًا.":body.code==="SLUG_EXISTS"?"رابط المتجر مستخدم، اختر رابطًا آخر.":"تعذر إنشاء الحساب والمتجر. تحقق من البيانات وحاول مجدداً.");return;} router.replace("/restaurant");router.refresh();
  }catch{setError("تعذر الاتصال بالخادم. حاول مجدداً.");}finally{setBusy(false);}
 }
 return <main className="auth-shell foonAuthPage"><section className="auth-card"><div className="auth-heading"><Link href="/" className="auth-brand">FOON</Link><span className="foonAuthTag">✦ ابدأ مجانًا</span></div><h1>إنشاء حساب ومتجر</h1><p>متجرك وباقتك المجانية يُفعّلان فور التسجيل، ويمكنك بدء العمل مباشرة.</p>
 <form onSubmit={submit} className="auth-form"><label>الاسم<input name="name" autoComplete="name" required maxLength={180}/></label><label>اسم النشاط<input name="storeName" required minLength={2} maxLength={180}/></label><label>نوع النشاط<select name="kind" defaultValue="store"><option value="store">متجر</option><option value="restaurant">مطعم</option></select></label><label>رابط المتجر<input name="slug" required minLength={3} maxLength={120} pattern="[a-z0-9][a-z0-9-]{1,118}[a-z0-9]" dir="ltr" placeholder="my-store"/></label><label>البريد الإلكتروني<input name="email" type="email" autoComplete="email" required dir="ltr"/></label><label>كلمة المرور<input name="password" type="password" autoComplete="new-password" required minLength={9} maxLength={128} dir="ltr"/><small>9 أحرف على الأقل</small></label>{error&&<div className="form-error" role="alert">{error}</div>}<button disabled={busy}>{busy?"جارٍ الإنشاء…":"إنشاء الحساب"}</button></form><p className="auth-switch">لديك حساب؟ <Link href="/login">تسجيل الدخول</Link></p></section></main>
}
