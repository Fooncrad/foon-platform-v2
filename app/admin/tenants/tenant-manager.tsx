"use client";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import { FormEvent,useEffect,useState } from "react";
import {useRouter} from "next/navigation";
type Tenant={id:string;name:string;slug:string;kind:string;status:string;plan_name?:string|null;subscription_status?:string|null};
async function api(url:string,init:RequestInit){const response=await fetch(url,init);const body=await response.json().catch(()=>({}));if(!response.ok||!body.ok)throw new Error(String(body.code??"HTTP_"+response.status));return body;}
export default function TenantManager({initial,canManage,canAccessAll}:{initial:Tenant[];canManage:boolean;canAccessAll:boolean}){
 const router=useRouter();
 const language=useUiLanguage();

 const tr=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const [items,setItems]=useState(initial),[message,setMessage]=useState(""),[busy,setBusy]=useState("");
 const [source,setSource]=useState(initial);
 if(source!==initial){setSource(initial);setItems(initial);}
 async function create(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!canManage||busy)return;
  const form=e.currentTarget;const f=new FormData(form);setMessage("");setBusy("create");
  try{
   const b=await api("/api/admin/tenants/provision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:f.get("name"),slug:f.get("slug"),ownerEmail:f.get("ownerEmail"),branchName:f.get("branchName"),kind:f.get("kind")})});
   setItems(v=>[{...b.tenant,kind:String(f.get("kind")),status:b.tenant.status??"active",plan_name:"مجانية",subscription_status:"active"},...v]);form.reset();setMessage(tr("تم إنشاء المتجر والفرع وربط المالك وتفعيل الباقة المجانية.","Store and branch created, owner linked and free plan activated.","Boutique et succursale créées, propriétaire associé et offre gratuite activée."));router.refresh();
  }catch(error){const code=error instanceof Error?error.message:"UNKNOWN";setMessage(code==="OWNER_NOT_FOUND"?tr("يجب أن يكون بريد المالك مسجلاً أولًا.","The owner email must be registered first.","L’adresse du propriétaire doit d’abord être enregistrée."):code==="DUPLICATE_RESOURCE"?tr("اسم الرابط أو العضوية مستخدم مسبقًا.","The URL or membership is already in use.","L’URL ou l’adhésion est déjà utilisée."):tr("تعذر إنشاء المتجر. رمز الخطأ: ","Could not create store. Error code: ","Impossible de créer la boutique. Code d’erreur : ")+code);}
  finally{setBusy("");}
 }
 async function changeStatus(id:string,status:string){
  if(!canManage||busy)return;setBusy(id);setMessage("");
  try{const b=await api(`/api/admin/tenants/${encodeURIComponent(id)}/status`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});setItems(v=>v.map(t=>t.id===id?{...t,status:b.status}:t));setMessage(tr("تم تحديث حالة المتجر.","Store status updated.","Statut de la boutique mis à jour."));router.refresh();}
  catch(error){setMessage(tr("تعذر تحديث حالة المتجر. رمز الخطأ: ","Could not update store status. Error code: ","Impossible de mettre à jour le statut. Code d’erreur : ")+(error instanceof Error?error.message:"NETWORK_ERROR"));}
  finally{setBusy("");}
 }
 async function accessTenant(id:string){if(busy)return;setBusy(id);try{const b=await api("/api/admin/tenants/"+encodeURIComponent(id)+"/access",{method:"POST"});router.push(b.url);}catch{setMessage(tr("تعذر فتح مساحة المتجر.","Could not open store workspace.","Impossible d’ouvrir l’espace de la boutique."));}finally{setBusy("");}}
 return <>{canManage&&<form className="provision-form" onSubmit={create}><input name="name" placeholder={tr("اسم المتجر","Store name","Nom de la boutique")} required/><input name="slug" placeholder="store-slug" dir="ltr" required/><input name="ownerEmail" type="email" placeholder="owner@example.com" dir="ltr" required/><input name="branchName" placeholder={tr("اسم الفرع الرئيسي","Main branch name","Nom de la succursale principale")} required/><select name="kind"><option value="restaurant">{tr("مطعم","Restaurant","Restaurant")}</option><option value="store">{tr("متجر","Store","Boutique")}</option></select><button disabled={busy!==""}>{busy==="create"?tr("جارٍ الإنشاء…","Creating…","Création…"):tr("إنشاء وربط المالك","Create and link owner","Créer et associer le propriétaire")}</button></form>}{message&&<div className="form-note" role="status" aria-live="polite">{message}</div>}
 <section className="tenant-list">{items.length===0?<div className="empty-state">{tr("لا توجد متاجر بعد.","No stores yet.","Aucune boutique pour le moment.")}</div>:items.map(t=><article key={t.id}><div><strong>{t.name}</strong><span dir="ltr">/{t.slug}</span>{canAccessAll&&<button type="button" disabled={busy!==""} onClick={()=>accessTenant(t.id)}>{tr("دخول إلى المتجر","Access store","Accéder à la boutique")}</button>}</div><div><span>{t.plan_name??tr("دون باقة","No plan","Sans offre")} · {t.subscription_status==="active"?tr("اشتراك نشط","Active subscription","Abonnement actif"):t.subscription_status??tr("دون اشتراك","No subscription","Sans abonnement")}</span><span>{t.kind==="restaurant"?tr("مطعم","Restaurant","Restaurant"):tr("متجر","Store","Boutique")}</span><b data-status={t.status}>{t.status==="pending"?tr("قيد المراجعة","Pending review","En attente de validation"):t.status==="active"?tr("نشط","Active","Actif"):t.status==="suspended"?tr("موقوف","Suspended","Suspendu"):t.status}</b>{canManage&&<select aria-label={`${tr("حالة المتجر","Store status","Statut de la boutique")} ${t.name}`} value={t.status} disabled={busy!==""} onChange={e=>changeStatus(t.id,e.target.value)}><option value="pending">{tr("قيد المراجعة","Pending review","En attente de validation")}</option><option value="active">{tr("نشط","Active","Actif")}</option><option value="suspended">{tr("موقوف","Suspended","Suspendu")}</option></select>}</div></article>)}</section></>;
}
