"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export default function UserActions({userId,status}:{userId:string;status:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");const router=useRouter();
 async function change(){const next=status==="suspended"?"active":"suspended";if(!window.confirm(next==="suspended"?"إيقاف الحساب وإنهاء جلساته الحالية؟":"إعادة تفعيل الحساب؟"))return;setBusy(true);setError("");try{const r=await fetch("/api/admin/users",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({userId,status:next})});const j=await r.json();if(!r.ok)throw Error(j.code);router.refresh();}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <div><button type="button" disabled={busy} onClick={change}>{busy?"جارٍ التنفيذ":status==="suspended"?"إعادة تفعيل":"إيقاف"}</button>{error&&<small role="alert">{error}</small>}</div>;
}
