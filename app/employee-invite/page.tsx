"use client";
import {useUiText} from "@/lib/i18n/ui-language";
import {Suspense,useState} from "react";
import {useSearchParams} from "next/navigation";
import Link from "next/link";
function EmployeeInviteContent(){
 const translateUi=useUiText();

 const params=useSearchParams(),token=params.get("token")??"";
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[password,setPassword]=useState("");
 async function accept(){setBusy(true);setMessage("");try{const response=await fetch("/api/employee-invite",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token,password:password||undefined})});const result=await response.json();if(!response.ok)throw Error(String(result.code??"INVITATION_UNAVAILABLE"));setMessage("تم قبول الدعوة وتفعيل حسابك في المطعم. يمكنك فتح لوحة المطعم الآن.");}catch(error){setMessage(error instanceof Error?error.message:"تعذر قبول الدعوة. سجّل الدخول بالبريد الذي استقبلها ثم أعد المحاولة.");}finally{setBusy(false);}}
 return <main style={{maxWidth:560,margin:"8vh auto",padding:24,fontFamily:"Arial,sans-serif"}}><h1>{translateUi("دعوة الانضمام إلى فريق FOON")}</h1><p>{translateUi("إذا لم يكن لديك حساب، اختر كلمة مرور خاصة بك (9 أحرف على الأقل) ثم اقبل الدعوة. إذا كان لديك حساب سابق بنفس البريد، سجّل الدخول أولًا ثم اقبل الدعوة.")}</p><p><Link href="/login">{translateUi("تسجيل الدخول")}</Link> · <Link href="/register">{translateUi("إنشاء حساب")}</Link></p><label style={{display:"grid",gap:8,marginBottom:16}}>{translateUi("كلمة مرور الموظف الجديد (اختياري للحساب الموجود)")}<input type="password" autoComplete="new-password" minLength={9} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder="9 أحرف على الأقل" /></label><button disabled={busy||!/^[A-Za-z0-9_-]{43}$/.test(token)||(password.length>0&&password.length<9)} onClick={accept} style={{padding:"12px 20px",cursor:"pointer"}}>{busy?"جارٍ قبول الدعوة…":"قبول الدعوة وتفعيل الحساب"}</button>{message&&<p role="status">{message}</p>}</main>;
}

export default function EmployeeInvitePage(){
 const translateUi=useUiText();
return <Suspense fallback={<main>{translateUi("جارٍ تحميل الدعوة…")}</main>}><EmployeeInviteContent/></Suspense>;}
