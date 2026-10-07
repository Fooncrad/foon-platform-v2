"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage(){
 const router=useRouter(); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");
  const data=new FormData(e.currentTarget);
  const res=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:data.get("email"),password:data.get("password")})});
  const body=await res.json().catch(()=>({}));
  setBusy(false); if(!res.ok){setError(body.code==="INVALID_CREDENTIALS"?"البريد الإلكتروني أو كلمة المرور غير صحيحة.":"تعذر تسجيل الدخول. حاول مجددًا.");return;}
  router.replace("/account");
 }
 return <main className="auth-shell"><section className="auth-card"><Link href="/" className="auth-brand">FOON</Link><h1>تسجيل الدخول</h1><p>ادخل إلى حسابك لإدارة خدماتك.</p>
 <form onSubmit={submit} className="auth-form"><label>البريد الإلكتروني<input name="email" type="email" autoComplete="email" required dir="ltr"/></label><label>كلمة المرور<input name="password" type="password" autoComplete="current-password" required minLength={9} dir="ltr"/></label>{error&&<div className="form-error" role="alert">{error}</div>}<button disabled={busy}>{busy?"جارٍ الدخول…":"دخول"}</button></form>
 <p className="auth-switch">ليس لديك حساب؟ <Link href="/register">إنشاء حساب</Link></p></section></main>
}
