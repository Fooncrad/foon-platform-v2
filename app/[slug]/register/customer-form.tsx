"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";

export default function CustomerForm({slug,name}:{slug:string;name:string}){
 const router=useRouter();const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setBusy(true);setError("");
  const data=new FormData(event.currentTarget);
  try{
   const r=await fetch("/api/customer/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({storeSlug:slug,name:data.get("name"),email:data.get("email"),password:data.get("password")})});
   const body=await r.json().catch(()=>({}));
   if(!r.ok){setError(body.code==="EMAIL_EXISTS"?"هذا البريد مسجل مسبقًا. استخدم تسجيل الدخول.":body.code==="STORE_NOT_FOUND"?"هذا المتجر غير متاح حالياً.":"تعذر إنشاء حساب العميل. راجع البيانات وحاول مجدداً.");return;}
   router.replace("/customer");router.refresh();
  }catch{setError("تعذر الاتصال بالخادم.");}finally{setBusy(false);}
 }
 return <main className="auth-shell" dir="rtl"><section className="auth-card"><Link className="auth-brand" href={`/${slug}`}>{name}</Link><h1>إنشاء حساب عميل</h1><nav className="customerAuthTabs" aria-label="الدخول والتسجيل"><Link href={`/${slug}/login`}>تسجيل الدخول</Link><span aria-current="page">حساب جديد</span></nav><p>سجّل كعميل لدى {name}.</p><form className="auth-form" onSubmit={submit}><label>الاسم<input name="name" required maxLength={180} autoComplete="name"/></label><label>البريد الإلكتروني<input name="email" type="email" required maxLength={254} autoComplete="email" dir="ltr"/></label><label>كلمة المرور<input name="password" type="password" required minLength={9} maxLength={128} autoComplete="new-password" dir="ltr"/></label>{error&&<p role="alert">{error}</p>}<button disabled={busy}>{busy?"جارٍ التسجيل…":"إنشاء حساب العميل"}</button></form><p><Link href={`/${slug}/login`}>حسابي · دخول العملاء</Link> · <Link href={`/${slug}`}>العودة إلى المتجر</Link></p></section></main>;
}
