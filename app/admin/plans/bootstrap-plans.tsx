"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export default function BootstrapPlans(){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[open,setOpen]=useState(false);
 const router=useRouter();
 async function run(){if(busy)return;setBusy(true);setMessage("");
 try{const r=await fetch("/api/admin/plans/bootstrap",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirm:"CREATE_FOUR_PLANS"})});const j=await r.json();if(!r.ok)throw Error(j.code);setMessage("تم إنشاء الباقات وتوزيع المميزات. يمكنك الآن مراجعتها وتعديل أسعارها.");setOpen(false);router.refresh();}
 catch(e){setMessage("تعذر الإنشاء: "+String(e));}finally{setBusy(false);}}
 return <div className="foonConfirmArea">
  <button type="button" className="foonActionButton" onClick={()=>setOpen(true)} disabled={busy}>إنشاء الباقات الأربع وتوزيع المميزات</button>
  {message&&<p className="adminOpsMessage" role="status">{message}</p>}
  {open&&<div className="foonModalOverlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false);}}>
   <section className="foonConfirmDialog" role="alertdialog" aria-modal="true" aria-labelledby="foon-plan-dialog-title" aria-describedby="foon-plan-dialog-desc" dir="rtl">
    <div className="foonConfirmMark" aria-hidden="true">FOON</div>
    <h3 id="foon-plan-dialog-title">تهيئة الباقات الأربع</h3>
    <p id="foon-plan-dialog-desc">سيتم إنشاء الباقات المجانية والأساسية والاحترافية والأعمال، وتوزيع المميزات غير الموجودة فقط. لن تتغير إعدادات الباقات الحالية.</p>
    <div className="foonConfirmActions">
     <button type="button" className="foonActionButton" onClick={run} disabled={busy}>{busy?"جارٍ الإنشاء…":"تأكيد الإنشاء"}</button>
     <button type="button" className="foonCancelButton" onClick={()=>setOpen(false)} disabled={busy}>إلغاء</button>
    </div>
   </section>
  </div>}
 </div>;
}
