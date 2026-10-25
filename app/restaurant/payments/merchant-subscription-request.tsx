"use client";
import {useEffect,useState,type FormEvent} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import Link from "next/link";
type Price={plan_id:string;name_ar:string;name_en:string;name_fr:string;billing_cycle:"monthly"|"yearly";currency:string;price:string;catalog_enabled:number|string;catalog_limit:number|null};
type Quota={used:number;productUsed:number;limit:number|null;enabled:boolean;feature:string};
type Receipt={payment_request_id:string;receipt_number:string;amount:string;currency:string;issued_at:string;billing_cycle:string;name_ar:string;name_en:string;name_fr:string};
type Request={id:string;amount:string;currency:string;billing_cycle:string;status:string;transfer_reference:string;review_note:string|null};
export default function MerchantSubscriptionRequest({tenantId}:{tenantId:string}){
 const lang=useUiLanguage();const t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 const [prices,setPrices]=useState<Price[]>([]),[requests,setRequests]=useState<Request[]>([]),[receipts,setReceipts]=useState<Receipt[]>([]),[chosen,setChosen]=useState(""),[reference,setReference]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[done,setDone]=useState("");
 const [evidence,setEvidence]=useState<File|null>(null);
 const [quota,setQuota]=useState<Quota|null>(null);
 const reload=async()=>{
  const r=await fetch("/api/tenant/subscription-requests?tenantId="+encodeURIComponent(tenantId),{cache:"no-store"});
  const data=await r.json();if(!r.ok)throw Error(data.code??"REQUEST_FAILED");
  setPrices(data.prices??[]);setRequests(data.requests??[]);setReceipts(data.receipts??[]);setQuota(data.quota??null);
 };
 useEffect(()=>{let active=true;fetch("/api/tenant/subscription-requests?tenantId="+encodeURIComponent(tenantId),{cache:"no-store"})
  .then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.code??"LOAD_FAILED");if(active){setPrices(data.prices??[]);setRequests(data.requests??[]);setReceipts(data.receipts??[]);setQuota(data.quota??null);}})
  .catch(()=>{if(active)setError(t("تعذر تحميل اشتراكات المنصة.","Subscriptions unavailable.","Abonnements indisponibles."));}).finally(()=>{if(active)setLoading(false);});
 return()=>{active=false;};},[tenantId,lang]);
 async function uploadEvidence(paymentRequestId:string,file:File){
  if(file.size===0||file.size>2097152)throw Error("EVIDENCE_TOO_LARGE");
  const form=new FormData();form.set("paymentRequestId",paymentRequestId);form.set("tenantId",tenantId);form.set("file",file);
  const r=await fetch("/api/tenant/subscription-requests/evidence",{method:"POST",body:form});
  const data=await r.json();if(!r.ok)throw Error(data.code??"EVIDENCE_SAVE_FAILED");
 }
 async function retryEvidence(){
  const pendingRequest=requests.find(r=>r.status==="pending");if(!pendingRequest||!evidence)return;
  setBusy(true);setError("");setDone("");
  try{await uploadEvidence(pendingRequest.id,evidence);setDone(t("تم رفع إثبات التحويل للمراجعة.","Evidence uploaded for review.","Preuve transférée pour vérification."));setEvidence(null);}
  catch(e){setError(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
 }
 async function submit(event:FormEvent){event.preventDefault();if(busy)return;
  const price=prices.find(p=>p.plan_id+":"+p.billing_cycle===chosen);if(!price)return;
  setBusy(true);setError("");setDone("");
  try{const r=await fetch("/api/tenant/subscription-requests",{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({tenantId,planId:price.plan_id,billingCycle:price.billing_cycle,transferReference:reference})});
   const d=await r.json();if(!r.ok)throw Error(d.code??"REQUEST_FAILED");
   if(evidence){try{await uploadEvidence(String(d.id),evidence);setEvidence(null);}
    catch(uploadError){setError(t("سُجّل الطلب لكن فشل رفع الإثبات. أعد رفعه على الطلب المعلق. ","Request saved; evidence upload failed. Retry on the pending request. ","Demande enregistrée, mais preuve non chargée. ")+String(uploadError instanceof Error?uploadError.message:uploadError));}}
   await reload();setReference("");setDone(t("تم إرسال طلب مراجعة التحويل. لن تتفعّل الباقة إلا بعد تأكيد الإدارة استلام المبلغ.","Transfer review requested. The plan activates only after verified payment.","Demande de contrôle envoyée. La formule s'active après vérification du paiement."));
  }catch(e){setError(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
 }
 const pending=requests.some(r=>r.status==="pending");
 const atLimit=Boolean(quota?.enabled&&quota.limit!==null&&Math.max(quota.used,quota.productUsed)>=quota.limit);
 const expandsLimit=(price:Price)=>Number(price.catalog_enabled)===1&&(price.catalog_limit===null||quota?.limit!==null&&Number(price.catalog_limit)>Math.max(quota?.limit??0,quota?.used??0,quota?.productUsed??0));
 const availablePlans=prices.filter(p=>!atLimit||expandsLimit(p));
 return <section className="adminPanel" style={{padding:16,marginBlock:22,border:"1px solid var(--border, #777)",borderRadius:16}}>
  <h2>{t("الاشتراك المدفوع للمنصة","Platform paid subscription","Abonnement payant FOON")}</h2>
  <p>{t("هذا القسم لرسوم اشتراك FOON، وهو منفصل عن مدفوعات طلبات عملائك. التحويل لا يُعتمد آليًا: تأكد من بيانات حساب المنصة البنكي، ثم أرسل مرجع التحويل لتراجعه الإدارة.","FOON subscription fees are separate from customer checkout. Verify platform bank details, transfer, then submit the reference for manual verification.","Les abonnements FOON sont distincts des paiements clients. Vérifiez le compte bancaire et transmettez la référence pour examen.")}</p>
  {loading?<p role="status">{t("جارٍ التحميل…","Loading…","Chargement…")}</p>:<>
  {quota&&<div role="status" style={{padding:12,border:"1px solid var(--border,#d6dde4)",borderRadius:12,marginBlock:14,background:"var(--surface,#fff)"}}>
    <strong>{t("حدود الأقسام والمنتجات في الباقة الحالية","Current category and product allowance","Limite actuelle des catégories et produits")}</strong>
    <p dir="ltr" style={{margin:"8px 0",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{t("الأقسام","Categories","Catégories")}: {quota.used.toLocaleString("en-US")} / {quota.enabled?(quota.limit===null?"∞":quota.limit.toLocaleString("en-US")):"—"}</p>
    <p dir="ltr" style={{margin:"8px 0",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{t("المنتجات","Products","Produits")}: {quota.productUsed.toLocaleString("en-US")} / {quota.enabled?(quota.limit===null?"∞":quota.limit.toLocaleString("en-US")):"—"}</p>
    <p style={{margin:0}}>{atLimit?t("وصلت إلى حد الأقسام أو المنتجات. اختر باقة بسعة أكبر.","Category or product limit reached. Choose a paid plan with higher capacity.","Limite de catégories ou de produits atteinte. Choisissez une formule supérieure."):t("اختر الباقة المناسبة لنشاطك وقارن حد الأقسام والمنتجات.","Compare the category and product allowance of plans available for your activity.","Comparez les limites des catégories et des produits.")}</p>
  </div>}
  {!prices.length&&<p role="status">{t("لا توجد باقات مدفوعة مفعّلة بعملة نشاطك حاليًا. تواصل مع إدارة FOON لإتاحة الباقات والأسعار.","No paid plans are published in this business currency yet. Contact FOON administration for plan availability.","Aucune formule payante disponible dans cette devise. Contactez l’administration FOON.")} <Link href="/contact">{t("تواصل معنا","Contact us","Nous contacter")}</Link></p>}
  {atLimit&&prices.length>0&&availablePlans.length===0&&<p role="status">{t("لا توجد باقة منشورة ترفع الحد الحالي للأقسام أو المنتجات. تواصل مع الإدارة لإعداد باقة أعلى.","No published paid plan increases your category or product limit. Contact administration to configure a suitable plan.","Aucune formule publiée ne relève ces limites. Contactez l’administration pour une offre adaptée.")} <Link href="/contact">{t("طلب المساعدة","Request help","Demander de l’aide")}</Link></p>}
  {availablePlans.length>0&&<form onSubmit={submit} style={{display:"grid",gap:12,maxWidth:640}}>
   <label>{t("الباقة والدورة","Plan and cycle","Formule et période")}
    <select required value={chosen} disabled={pending||busy} onChange={e=>setChosen(e.target.value)}>
     <option value="">{t("اختر باقة مدفوعة","Choose a paid plan","Choisir une offre")}</option>
     {availablePlans.map(p=><option key={p.plan_id+":"+p.billing_cycle} value={p.plan_id+":"+p.billing_cycle}>
      {lang==="en"?p.name_en:lang==="fr"?p.name_fr:p.name_ar} — {p.price} {p.currency} / {p.billing_cycle==="yearly"?t("سنوي","year","an"):t("شهري","month","mois")} — {Number(p.catalog_enabled)===1?t("حد الأقسام والمنتجات: ","Categories/products: ","Catégories/produits : ")+(p.catalog_limit===null?t("غير محدود","Unlimited","Illimité"):p.catalog_limit):t("الكتالوج غير مشمول","Catalog not included","Catalogue non inclus")}
     </option>)}
    </select>
   </label>
   <label>{t("مرجع التحويل البنكي بعد الدفع","Bank transfer reference after payment","Référence du virement après paiement")}
    <input required minLength={8} maxLength={120} value={reference} disabled={pending||busy} onChange={e=>setReference(e.target.value)}/>
   </label>
   <label>{t("إثبات التحويل (PDF أو صورة، 2 MB كحد أقصى)","Transfer evidence (PDF/image, 2 MB max)","Preuve du virement (PDF/image, 2 Mo max)")}
    <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/png,image/jpeg" onChange={e=>setEvidence(e.target.files?.[0]??null)} disabled={busy}/>
   </label>
   <button type="submit" disabled={!chosen||pending||busy}>{busy?t("جارٍ الإرسال…","Submitting…","Envoi…"):t("إرسال طلب اعتماد الدفع","Submit paid transfer for review","Envoyer le virement")}</button>
  </form>}
  {pending&&<div><p role="status">{t("لديك طلب معلق، انتظر قرار الإدارة قبل تقديم طلب جديد.","A payment request is pending review.","Une demande de paiement est en attente.")}</p>
    <button type="button" disabled={busy||!evidence} onClick={()=>void retryEvidence()}>{t("رفع إثبات للطلب المعلق","Upload evidence to pending request","Ajouter une preuve")}</button>
   </div>}
  {requests.length>0&&<div style={{display:"grid",gap:8,marginTop:16}}>{requests.slice(0,8).map(r=><p key={r.id} style={{margin:0,padding:8,border:"1px solid #8885",borderRadius:8}}>{r.amount} {r.currency} · {r.billing_cycle==="yearly"?t("سنوي","Yearly","Annuel"):t("شهري","Monthly","Mensuel")} · {r.status==="approved"?t("معتمد","Approved","Approuvé"):r.status==="rejected"?t("مرفوض","Rejected","Rejeté"):t("قيد المراجعة","Pending","En attente")}{r.review_note&&" · "+r.review_note}</p>)}</div>}
  <section aria-label={t("إيصالات الاشتراك","Subscription receipts","Reçus d'abonnement")} style={{marginTop:20}}>
   <h3>{t("إيصالات اشتراكات FOON","FOON subscription receipts","Reçus des abonnements FOON")}</h3>
   {receipts.length?<div style={{display:"grid",gap:8}}>{receipts.map(receipt=><p key={receipt.payment_request_id} style={{margin:0,padding:10,border:"1px solid #8885",borderRadius:8}}>
    <b dir="ltr">{receipt.receipt_number}</b> · {lang==="en"?receipt.name_en:lang==="fr"?receipt.name_fr:receipt.name_ar} ·
    <span dir="ltr"> {receipt.amount} {receipt.currency}</span> ·
    <a href={"/tenant/subscription-receipts/"+encodeURIComponent(receipt.payment_request_id)}>{t("عرض الإيصال","View receipt","Voir le reçu")}</a>
   </p>)}</div>:<p>{t("لا توجد إيصالات اشتراك مدفوعة حتى الآن.","No paid subscription receipts yet.","Aucun reçu d'abonnement payé.")}</p>}
  </section>
  {done&&<p role="status">{done}</p>}{error&&<p role="alert">{error}</p>}
  </>}
 </section>;
}
