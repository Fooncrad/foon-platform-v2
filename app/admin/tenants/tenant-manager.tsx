"use client";
import { FormEvent,useState } from "react";
type Tenant={id:string;name:string;slug:string;kind:string;status:string};
export default function TenantManager({initial}:{initial:Tenant[]}){
 const [items,setItems]=useState(initial),[message,setMessage]=useState("");
 async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();setMessage("");const f=new FormData(e.currentTarget);
 const r=await fetch("/api/admin/tenants/provision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:f.get("name"),slug:f.get("slug"),ownerEmail:f.get("ownerEmail"),branchName:f.get("branchName"),kind:f.get("kind")})});const b=await r.json();
 if(!r.ok){setMessage(b.code==="OWNER_NOT_FOUND"?"يجب أن يكون بريد المالك مسجلاً أولًا.":b.code==="DUPLICATE_RESOURCE"?"اسم الرابط أو العضوية مستخدم مسبقًا.":"تعذر إنشاء المتجر.");return;}
 setItems(v=>[{...b.tenant,kind:String(f.get("kind")),status:"active"},...v]);e.currentTarget.reset();setMessage("تم إنشاء المتجر والفرع وربط المالك.");
 }
 return <><form className="provision-form" onSubmit={create}><input name="name" placeholder="اسم المتجر" required/><input name="slug" placeholder="store-slug" dir="ltr" required/><input name="ownerEmail" type="email" placeholder="owner@example.com" dir="ltr" required/><input name="branchName" placeholder="اسم الفرع الرئيسي" required/><select name="kind"><option value="restaurant">مطعم</option><option value="store">متجر</option></select><button>إنشاء وربط المالك</button></form>{message&&<div className="form-note">{message}</div>}<section className="tenant-list">{items.map(t=><article key={t.id}><div><strong>{t.name}</strong><span dir="ltr">/menu/{t.slug}</span></div><div><span>{t.kind==="restaurant"?"مطعم":"متجر"}</span><b data-status={t.status}>{t.status}</b></div></article>)}</section></>;
}
