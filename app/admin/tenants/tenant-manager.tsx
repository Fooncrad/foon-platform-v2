"use client";
import { FormEvent,useState } from "react";
type Tenant={id:string;name:string;slug:string;kind:string;status:string};
const labels:Record<string,string>={pending:"قيد المراجعة",active:"نشط",suspended:"موقوف"};
export default function TenantManager({initial}:{initial:Tenant[]}){
 const [items,setItems]=useState(initial),[message,setMessage]=useState(""),[busy,setBusy]=useState("");
 async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();setMessage("");setBusy("create");const form=e.currentTarget;const f=new FormData(form);
  const r=await fetch("/api/admin/tenants/provision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:f.get("name"),slug:f.get("slug"),ownerEmail:f.get("ownerEmail"),branchName:f.get("branchName"),kind:f.get("kind")})});const b=await r.json().catch(()=>({}));setBusy("");
  if(!r.ok){setMessage(b.code==="OWNER_NOT_FOUND"?"يجب أن يكون بريد المالك مسجلاً أولًا.":b.code==="DUPLICATE_RESOURCE"?"اسم الرابط أو العضوية مستخدم مسبقًا.":"تعذر إنشاء المتجر.");return;}
  setItems(v=>[{...b.tenant,kind:String(f.get("kind")),status:"active"},...v]);form.reset();setMessage("تم إنشاء المتجر والفرع وربط المالك.");
 }
 async function changeStatus(id:string,status:string){setBusy(id);setMessage("");const r=await fetch(`/api/admin/tenants/${id}/status`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});const b=await r.json().catch(()=>({}));setBusy("");
  if(!r.ok){setMessage("تعذر تحديث حالة المتجر.");return;}setItems(v=>v.map(t=>t.id===id?{...t,status:b.status}:t));
 }
 return <><form className="provision-form" onSubmit={create}><input name="name" placeholder="اسم المتجر" required/><input name="slug" placeholder="store-slug" dir="ltr" required/><input name="ownerEmail" type="email" placeholder="owner@example.com" dir="ltr" required/><input name="branchName" placeholder="اسم الفرع الرئيسي" required/><select name="kind"><option value="restaurant">مطعم</option><option value="store">متجر</option></select><button disabled={busy==="create"}>{busy==="create"?"جارٍ الإنشاء…":"إنشاء وربط المالك"}</button></form>{message&&<div className="form-note" role="status">{message}</div>}
 <section className="tenant-list">{items.length===0?<div className="empty-state">لا توجد متاجر بعد.</div>:items.map(t=><article key={t.id}><div><strong>{t.name}</strong><span dir="ltr">/menu/{t.slug}</span></div><div><span>{t.kind==="restaurant"?"مطعم":"متجر"}</span><b data-status={t.status}>{labels[t.status]??t.status}</b><select aria-label="حالة المتجر" value={t.status} disabled={busy===t.id} onChange={e=>changeStatus(t.id,e.target.value)}><option value="pending">قيد المراجعة</option><option value="active">نشط</option><option value="suspended">موقوف</option></select></div></article>)}</section></>;
}
