"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export default function UserActions({userId,status,platformRole}:{userId:string;status:string;platformRole:string|null}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");const router=useRouter();
 async function change(){const next=status==="suspended"?"active":"suspended";if(!window.confirm(next==="suspended"?"إيقاف الحساب وإنهاء جلساته الحالية؟":"إعادة تفعيل الحساب؟"))return;setBusy(true);setError("");try{const r=await fetch("/api/admin/users",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({userId,status:next})});const j=await r.json();if(!r.ok)throw Error(j.code);router.refresh();}catch(e){setError(String(e));}finally{setBusy(false);}}
 async function changeRole(role:string){if(!window.confirm("تغيير دور المنصة لهذا الحساب؟ سيتم إنهاء جلساته الحالية."))return;setBusy(true);setError("");try{const r=await fetch("/api/admin/users/roles",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({userId,role})});const j=await r.json();if(!r.ok)throw Error(j.code);router.refresh();}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <div><label>دور المنصة <select aria-label="تغيير دور المنصة" disabled={busy||status!=="active"} value={platformRole??"none"} onChange={e=>changeRole(e.target.value)}><option value="none">بدون دور</option><option value="support">الدعم</option><option value="admin">مدير</option></select></label><button type="button" disabled={busy} onClick={change}>{busy?"جارٍ التنفيذ":status==="suspended"?"إعادة تفعيل":"إيقاف"}</button>{error&&<small role="alert">{error}</small>}</div>;
}
