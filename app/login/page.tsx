"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage(){
 const router=useRouter();const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const data=new FormData(e.currentTarget);
  try{const res=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:data.get("email"),password:data.get("password")})});
  const body=await res.json().catch(()=>({}));setBusy(false);
  if(!res.ok){setError(body.code==="INVALID_CREDENTIALS"?"البريد الإلكتروني أو كلمة المرور غير صحيحة.":body.code==="TOO_MANY_ATTEMPTS"?"محاولات كثيرة. حاول مرة أخرى لاحقًا.":"تعذر تسجيل الدخول. حاول مجددًا.");return;}
  router.replace("/account");router.refresh();}catch{setError("تعذر الاتصال بالخادم. حاول مجددًا.");setBusy(false);}
 }
 return <main className="auth-shell foonAuthPage"><section className="auth-card"><div className="auth-heading"><Link href="/" className="auth-brand">FOON</Link><span className="foonAuthTag">✦ دخول آمن</span></div><h1>مرحبًا بعودتك</h1><p>سجّل الدخول للوصول إلى مساحة العمل الخاصة بك.</p>
 <form onSubmit={submit} className="auth-form"><label>البريد الإلكتروني<input name="email" type="email" inputMode="email" autoComplete="email" required dir="ltr" placeholder="name@example.com"/></label><label>كلمة المرور<input name="password" type="password" autoComplete="current-password" required minLength={9} dir="ltr" placeholder="•••••••••"/></label><Link href="/forgot-password">نسيت كلمة المرور؟</Link>{error&&<div className="form-error" role="alert">{error}</div>}<button disabled={busy} aria-busy={busy}>{busy?"جارٍ تسجيل الدخول…":"تسجيل الدخول"}</button></form>
 <p className="auth-switch">ليس لديك حساب؟ <Link href="/register">إنشاء حساب جديد</Link></p><Link className="auth-home" href="/">العودة إلى الرئيسية</Link></section></main>
}