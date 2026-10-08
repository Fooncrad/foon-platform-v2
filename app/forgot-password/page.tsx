"use client";
import {FormEvent,useState} from "react";
import Link from "next/link";

export default function ForgotPasswordPage(){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [success,setSuccess]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  setBusy(true);setMessage("");setSuccess(false);
  const form=new FormData(event.currentTarget);
  try{
   const response=await fetch("/api/auth/request-password-reset",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:form.get("email")})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok){setMessage("تعذر إرسال رابط الاستعادة. رمز الخطأ: "+String(result.code??response.status));return;}
   setSuccess(true);setMessage("إذا كان البريد مسجلاً، ستصلك رسالة تحتوي على رابط الاستعادة.");
  }catch{setMessage("تعذر الاتصال بالخادم. حاول مرة أخرى.");}
  finally{setBusy(false);}
 }
 return <main className="auth-shell"><section className="auth-card" dir="rtl">
  <div className="auth-heading"><Link href="/" className="auth-brand">FOON</Link><span>استعادة الحساب</span></div>
  <h1>نسيت كلمة المرور؟</h1><p>أدخل بريد حسابك الإلكتروني لطلب رابط تعيين كلمة مرور جديدة.</p>
  <form className="auth-form" onSubmit={submit}>
   <label>البريد الإلكتروني<input name="email" type="email" autoComplete="email" inputMode="email" dir="ltr" required placeholder="name@example.com"/></label>
   {message&&<div className={success?"form-note":"form-error"} role="status">{message}</div>}
   <button disabled={busy}>{busy?"جارٍ الإرسال…":"إرسال رابط الاستعادة"}</button>
  </form>
  <p className="auth-switch"><Link href="/login">العودة إلى تسجيل الدخول</Link></p>
 </section></main>;
}
