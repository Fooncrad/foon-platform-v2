"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage(){
 const router=useRouter(); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const data=new FormData(e.currentTarget);
  const res=await fetch("/api/auth/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:data.get("name"),email:data.get("email"),password:data.get("password")})}); const body=await res.json().catch(()=>({}));setBusy(false);
  if(!res.ok){setError(body.code==="EMAIL_EXISTS"?"هذا البريد مسجل مسبقًا.":"تعذر إنشاء الحساب. تحقق من البيانات.");return;} router.replace("/account");
 }
 return <main className="auth-shell"><section className="auth-card"><Link href="/" className="auth-brand">FOON</Link><h1>إنشاء حساب</h1><p>ابدأ حسابك الجديد على FOON.</p>
 <form onSubmit={submit} className="auth-form"><label>الاسم<input name="name" autoComplete="name" required maxLength={180}/></label><label>البريد الإلكتروني<input name="email" type="email" autoComplete="email" required dir="ltr"/></label><label>كلمة المرور<input name="password" type="password" autoComplete="new-password" required minLength={9} maxLength={128} dir="ltr"/><small>9 أحرف على الأقل</small></label>{error&&<div className="form-error" role="alert">{error}</div>}<button disabled={busy}>{busy?"جارٍ الإنشاء…":"إنشاء الحساب"}</button></form><p className="auth-switch">لديك حساب؟ <Link href="/login">تسجيل الدخول</Link></p></section></main>
}
