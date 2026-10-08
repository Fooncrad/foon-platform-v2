"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export default function BootstrapPlans(){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");const router=useRouter();
 async function run(){if(busy||!window.confirm("إنشاء الباقات الأربع وتوزيع المميزات غير الموجودة فقط؟ لن تتغير إعدادات الباقات الموجودة."))return;setBusy(true);setMessage("");
 try{const r=await fetch("/api/admin/plans/bootstrap",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirm:"CREATE_FOUR_PLANS"})});const j=await r.json();if(!r.ok)throw Error(j.code);setMessage("تم إنشاء الكتالوج. الأسعار غير محددة ويمكن تعديل المميزات.");router.refresh();}catch(e){setMessage("تعذر الإنشاء: "+String(e));}finally{setBusy(false);}}
 return <div><button onClick={run} disabled={busy}>{busy?"جارٍ الإنشاء…":"إنشاء الباقات الأربع وتوزيع المميزات"}</button>{message&&<p role="status">{message}</p>}</div>;
}
