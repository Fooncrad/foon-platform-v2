"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
export default function CustomerLoginForm({slug,name}:{slug:string;name:string}){
 const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setBusy(true);setError("");
  const form=new FormData(event.currentTarget);
  try{
   const response=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:form.get("email"),password:form.get("password")})});
   const body=await response.json().catch(()=>({}));
   if(!response.ok){setError(body.code==="TOO_MANY_ATTEMPTS"?"محاولات كثيرة، حاول لاحقًا.":"تعذر الدخول. تحقق من البريد وكلمة المرور.");return}
   const join=await fetch("/api/customer/join-store",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({storeSlug:slug})});
   if(!join.ok){setError("تم تسجيل الدخول، لكن تعذر ربط هذا المتجر بحسابك. حاول مجددًا.");return}
   router.replace("/customer");router.refresh();
  }catch{setError("تعذر الاتصال بالخادم. حاول مجددًا.")}finally{setBusy(false)}
 }
 return <main className="auth-shell" dir="rtl"><section className="auth-card"><Link className="auth-brand" href={`/${slug}`}>{name}</Link><h1>حسابي · دخول العملاء</h1><nav className="customerAuthTabs" aria-label="الدخول والتسجيل"><span aria-current="page">تسجيل الدخول</span><Link href={`/${slug}/register`}>حساب جديد</Link></nav><p>تسجيل دخول العملاء عبر {name}.</p><form className="auth-form" onSubmit={submit}><label>البريد الإلكتروني<input type="email" name="email" autoComplete="email" dir="ltr" required/></label><label>كلمة المرور<input type="password" name="password" autoComplete="current-password" dir="ltr" required/></label>{error&&<p role="alert" className="form-error">{error}</p>}<button disabled={busy}>{busy?"جارٍ الدخول…":"دخول العملاء"}</button></form><p className="auth-switch">ليس لديك حساب؟ <Link href={`/${slug}/register`}>سجّل لدى المتجر</Link></p><Link className="auth-home" href={`/${slug}`}>العودة إلى المتجر</Link></section></main>;
}
