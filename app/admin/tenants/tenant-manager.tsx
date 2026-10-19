import {publicStorefrontUrl} from "@/lib/tenant/workspace-routes";
"use client";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import { FormEvent,useState } from "react";
import {useRouter} from "next/navigation";
type Tenant={id:string;name:string;slug:string;kind:string;status:string;market_enabled?:boolean|number;market_visible_from?:string|null;market_visible_until?:string|null;market_sort_order?:number;plan_name?:string|null;subscription_status?:string|null};
async function api(url:string,init:RequestInit){const response=await fetch(url,init);const body=await response.json().catch(()=>({}));if(!response.ok||!body.ok)throw new Error(String(body.code??"HTTP_"+response.status));return body;}
export default function TenantManager({initial,canManage,canSupport}:{initial:Tenant[];canManage:boolean;canSupport:boolean}){
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
 async function saveListing(e:FormEvent<HTMLFormElement>,tenant:Tenant){
  e.preventDefault();if(!canManage||busy)return;const f=new FormData(e.currentTarget);setBusy("listing:"+tenant.id);setMessage("");
  try{const b=await api(`/api/admin/tenants/${encodeURIComponent(tenant.id)}/listing`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({enabled:f.get("enabled")==="on",visibleFrom:f.get("visibleFrom")||null,visibleUntil:f.get("visibleUntil")||null,sortOrder:Number(f.get("sortOrder")||0)})});setItems(v=>v.map(t=>t.id===tenant.id?{...t,market_enabled:b.enabled,market_visible_from:b.visibleFrom,market_visible_until:b.visibleUntil,market_sort_order:b.sortOrder}:t));setMessage(tr("تم حفظ ظهور النشاط في السوق وجدولته.","Marketplace visibility and schedule saved.","Visibilité et calendrier du marché enregistrés."));router.refresh();}
  catch(error){setMessage(tr("تعذر حفظ إعدادات الظهور. رمز الخطأ: ","Could not save listing settings. Error code: ","Impossible d’enregistrer les paramètres. Code : ")+(error instanceof Error?error.message:"NETWORK_ERROR"));}finally{setBusy("");}
 }
 async function enterSupport(id:string){
  if(!canSupport||busy)return;setBusy("support:"+id);setMessage("");
  try{const b=await api(`/api/admin/tenants/${encodeURIComponent(id)}/access`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});window.location.assign(String(b.url));}
  catch(error){setMessage(tr("تعذر بدء جلسة الدعم. رمز الخطأ: ","Could not start the support session. Error code: ","Impossible de démarrer la session de support. Code d’erreur : ")+(error instanceof Error?error.message:"NETWORK_ERROR"));setBusy("");}
 }

 return <>{canManage&&<form className="provision-form" onSubmit={create}><input name="name" placeholder={tr("اسم المتجر","Store name","Nom de la boutique")} required/><input name="slug" placeholder="store-slug" dir="ltr" required/><input name="ownerEmail" type="email" placeholder="owner@example.com" dir="ltr" required/><input name="branchName" placeholder={tr("اسم الفرع الرئيسي","Main branch name","Nom de la succursale principale")} required/><select name="kind"><option value="restaurant">{tr("مطعم","Restaurant","Restaurant")}</option><option value="store">{tr("متجر","Store","Boutique")}</option></select><button disabled={busy!==""}>{busy==="create"?tr("جارٍ الإنشاء…","Creating…","Création…"):tr("إنشاء وربط المالك","Create and link owner","Créer et associer le propriétaire")}</button></form>}{message&&<div className="form-note" role="status" aria-live="polite">{message}</div>}
 <section className="tenant-list">{items.length===0?<div className="empty-state">{tr("لا توجد متاجر بعد.","No stores yet.","Aucune boutique pour le moment.")}</div>:items.map(t=><article key={t.id}><div><strong>{t.name}</strong><span dir="ltr">/{t.slug}</span><a href={publicStorefrontUrl(t.slug)} target="_blank" rel="noreferrer">{tr("زيارة الواجهة العامة","Visit storefront","Voir la boutique")}</a></div><div><span>{t.plan_name??tr("دون باقة","No plan","Sans offre")} · {t.subscription_status==="active"?tr("اشتراك نشط","Active subscription","Abonnement actif"):t.subscription_status??tr("دون اشتراك","No subscription","Sans abonnement")}</span><span>{t.kind==="restaurant"?tr("مطعم","Restaurant","Restaurant"):tr("متجر","Store","Boutique")}</span><b data-status={t.status}>{t.status==="pending"?tr("قيد المراجعة","Pending review","En attente de validation"):t.status==="active"?tr("نشط","Active","Actif"):t.status==="suspended"?tr("موقوف","Suspended","Suspended"):t.status}</b>{canManage&&<select aria-label={`${tr("حالة المتجر","Store status","Statut de la boutique")} ${t.name}`} value={t.status} disabled={busy!==""} onChange={e=>changeStatus(t.id,e.target.value)}><option value="pending">{tr("قيد المراجعة","Pending review","En attente de validation")}</option><option value="active">{tr("نشط","Active","Actif")}</option><option value="suspended">{tr("موقوف","Suspended","Suspendu")}</option></select>}{canSupport&&<button type="button" disabled={busy!==""||t.status!=="active"} onClick={()=>enterSupport(t.id)}>{busy==="support:"+t.id?tr("جارٍ الدخول…","Opening…","Ouverture…"):canManage?tr("دخول كامل للدعم","Full support access","Accès complet au support"):tr("دخول للعرض والدعم","View support session","Accès support en lecture seule")}</button>}{canManage&&<details className="tenantListingSettings"><summary>{Boolean(t.market_enabled)?tr("إدارة ظهور المتجر","Manage marketplace listing","Gérer la visibilité"):tr("إظهار المتجر في السوق","Show store in marketplace","Afficher dans le marché")}</summary><form onSubmit={e=>void saveListing(e,t)}><label><input type="checkbox" name="enabled" defaultChecked={Boolean(t.market_enabled)}/>{tr("ظاهر في السوق","Visible in marketplace","Visible sur le marché")}</label><label>{tr("يظهر من (UTC)","Visible from (UTC)","Visible à partir de (UTC)")}<input name="visibleFrom" type="datetime-local" defaultValue={asDateInput(t.market_visible_from)}/></label><label>{tr("إخفاء بعد (UTC)","Hide after (UTC)","Masquer après (UTC)")}<input name="visibleUntil" type="datetime-local" defaultValue={asDateInput(t.market_visible_until)}/></label><label>{tr("ترتيب الظهور","Display order","Ordre d’affichage")}<input name="sortOrder" type="number" min={-100000} max={100000} defaultValue={t.market_sort_order??0}/></label><button type="submit" disabled={busy!==""}>{busy==="listing:"+t.id?tr("جارٍ الحفظ…","Saving…","Enregistrement…"):tr("حفظ الظهور","Save listing","Enregistrer")}</button></form></details>}</div></article>)}</section></>;
}

function asDateInput(value:unknown){
 if(!value)return "";const date=new Date(typeof value==="string"?value.replace(" ","T")+(/Z|[+-]\d\d:\d\d$/.test(value)?"":"Z"):"");
 return Number.isFinite(date.getTime())?date.toISOString().slice(0,16):"";
}
