"use client";
import {Suspense,useState} from "react";
import {useSearchParams} from "next/navigation";
import Link from "next/link";
function EmployeeInviteContent(){
 const params=useSearchParams(),token=params.get("token")??"";
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function accept(){setBusy(true);setMessage("");try{const response=await fetch("/api/employee-invite",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})});const result=await response.json();if(!response.ok)throw Error(String(result.code??"INVITATION_UNAVAILABLE"));setMessage("تم قبول الدعوة وتفعيل حسابك في المطعم. يمكنك فتح لوحة المطعم الآن.");}catch(error){setMessage(error instanceof Error?error.message:"تعذر قبول الدعوة. سجّل الدخول بالبريد الذي استقبلها ثم أعد المحاولة.");}finally{setBusy(false);}}
 return <main dir="rtl" style={{maxWidth:560,margin:"8vh auto",padding:24,fontFamily:"Arial,sans-serif"}}><h1>دعوة الانضمام إلى فريق FOON</h1><p>سجّل الدخول بالحساب الذي استقبل الدعوة، أو أنشئ حسابًا بنفس البريد ثم عُد إلى هذا الرابط لقبول الدعوة.</p><p><Link href="/login">تسجيل الدخول</Link> · <Link href="/register">إنشاء حساب</Link></p><button disabled={busy||!/^[A-Za-z0-9_-]{43}$/.test(token)} onClick={accept} style={{padding:"12px 20px",cursor:"pointer"}}>{busy?"جارٍ قبول الدعوة…":"قبول الدعوة وتفعيل الحساب"}</button>{message&&<p role="status">{message}</p>}</main>;
}

export default function EmployeeInvitePage(){return <Suspense fallback={<main dir="rtl">جارٍ تحميل الدعوة…</main>}><EmployeeInviteContent/></Suspense>;}
