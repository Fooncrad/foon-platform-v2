"use client";
import { FormEvent,useState } from "react";
import {useRouter} from "next/navigation";
type Tenant={id:string;name:string;slug:string;kind:string;status:string;plan_name?:string|null;subscription_status?:string|null};
const labels:Record<string,string>={pending:"قيد المراجعة",active:"نشط",suspended:"موقوف"};
async function api(url:string,init:RequestInit){const response=await fetch(url,init);const body=await response.json().catch(()=>({}));if(!response.ok||!body.ok)throw new Error(String(body.code??"HTTP_"+response.status));return body;}
export default function TenantManager({initial,canManage,canAccessAll}:{initial:Tenant[];canManage:boolean;canAccessAll:boolean}){
 const router=useRouter();
 const [items,setItems]=useState(initial),[message,setMessage]=useState(""),[busy,setBusy]=useState("");
 const [source,setSource]=useState(initial);
 if(source!==initial){setSource(initial);setItems(initial);}
 async function create(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!canManage||busy)return;
  const form=e.currentTarget;const f=new FormData(form);setMessage("");setBusy("create");
  try{
   const b=await api("/api/admin/tenants/provision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:f.get("name"),slug:f.get("slug"),ownerEmail:f.get("ownerEmail"),branchName:f.get("branchName"),kind:f.get("kind")})});
   setItems(v=>[{...b.tenant,kind:String(f.get("kind")),status:b.tenant.status??"active",plan_name:"مجانية",subscription_status:"active"},...v]);form.reset();setMessage("تم إنشاء المتجر والفرع وربط المالك وتفعيل الباقة المجانية.");router.refresh();
  }catch(error){const code=error instanceof Error?error.message:"UNKNOWN";setMessage(code==="OWNER_NOT_FOUND"?"يجب أن يكون بريد المالك مسجلاً أولًا.":code==="DUPLICATE_RESOURCE"?"اسم الرابط أو العضوية مستخدم مسبقًا.":"تعذر إنشاء المتجر. رمز الخطأ: "+code);}
  finally{setBusy("");}
 }
 async function changeStatus(id:string,status:string){
  if(!canManage||busy)return;setBusy(id);setMessage("");
  try{const b=await api(`/api/admin/tenants/${encodeURIComponent(id)}/status`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});setItems(v=>v.map(t=>t.id===id?{...t,status:b.status}:t));setMessage("تم تحديث حالة المتجر.");router.refresh();}
  catch(error){setMessage("تعذر تحديث حالة المتجر. رمز الخطأ: "+(error instanceof Error?error.message:"NETWORK_ERROR"));}
  finally{setBusy("");}
 }
 async function accessTenant(id:string){if(busy)return;setBusy(id);try{const b=await api("/api/admin/tenants/"+encodeURIComponent(id)+"/access",{method:"POST"});router.push(b.url);}catch{setMessage("تعذر فتح مساحة المتجر.");}finally{setBusy("");}}
 return <>{canManage&&<form className="provision-form" onSubmit={create}><input name="name" placeholder="اسم المتجر" required/><input name="slug" placeholder="store-slug" dir="ltr" required/><input name="ownerEmail" type="email" placeholder="owner@example.com" dir="ltr" required/><input name="branchName" placeholder="اسم الفرع الرئيسي" required/><select name="kind"><option value="restaurant">مطعم</option><option value="store">متجر</option></select><button disabled={busy!==""}>{busy==="create"?"جارٍ الإنشاء…":"إنشاء وربط المالك"}</button></form>}{message&&<div className="form-note" role="status" aria-live="polite">{message}</div>}
 <section className="tenant-list">{items.length===0?<div className="empty-state">لا توجد متاجر بعد.</div>:items.map(t=><article key={t.id}><div><strong>{t.name}</strong><span dir="ltr">/{t.slug}</span>{canAccessAll&&<button type="button" disabled={busy!==""} onClick={()=>accessTenant(t.id)}>دخول إلى المتجر</button>}</div><div><span>{t.plan_name??"دون باقة"} · {t.subscription_status==="active"?"اشتراك نشط":t.subscription_status??"دون اشتراك"}</span><span>{t.kind==="restaurant"?"مطعم":"متجر"}</span><b data-status={t.status}>{labels[t.status]??t.status}</b>{canManage&&<select aria-label={`حالة المتجر ${t.name}`} value={t.status} disabled={busy!==""} onChange={e=>changeStatus(t.id,e.target.value)}><option value="pending">قيد المراجعة</option><option value="active">نشط</option><option value="suspended">موقوف</option></select>}</div></article>)}</section></>;
}
