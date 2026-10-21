"use client";
import {useEffect,useState} from "react";
import {useUiText} from "@/lib/i18n/ui-language";
type Ledger={id:string;tenant_name:string;creator_name:string;billing_cycle:string;currency:string;base_amount:string;amount:string;status:string;commission_basis_points:number;paid_at:string|null;payout_reference:string|null};
export default function CreatorCommissionAdmin({canEdit}:{canEdit:boolean}){
 const t=useUiText();
 const [enabled,setEnabled]=useState(false),[rate,setRate]=useState("0"),[rows,setRows]=useState<Ledger[]>([]),[busy,setBusy]=useState(false),[err,setErr]=useState(""),[notice,setNotice]=useState("");
 const [references,setReferences]=useState<Record<string,string>>({});
 async function refresh(){
  const r=await fetch("/api/admin/creator-commissions",{cache:"no-store"});const d=await r.json();
  if(!r.ok)throw Error(d.code??"LOAD_FAILED");
  setEnabled(Boolean(d.settings?.enabled));setRate(String(Number(d.settings?.commission_basis_points??0)/100));setRows(d.commissions??[]);
 }
 useEffect(()=>{let live=true;fetch("/api/admin/creator-commissions",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.code??"LOAD_FAILED");
 if(live){setEnabled(Boolean(d.settings?.enabled));setRate(String(Number(d.settings?.commission_basis_points??0)/100));setRows(d.commissions??[]);}}).catch(()=>{if(live)setErr("تعذر تحميل العمولات");});return()=>{live=false;};},[]);
 async function configure(){setBusy(true);setErr("");setNotice("");try{
  const r=await fetch("/api/admin/creator-commissions",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({enabled,percentage:Number(rate)})});
  const d=await r.json();if(!r.ok)throw Error(d.code??"SAVE_FAILED");await refresh();setNotice("تم حفظ نسبة العمولة. النسبة الجديدة تطبق على المدفوعات المعتمدة لاحقًا فقط.");
 }catch(e){setErr(String(e instanceof Error?e.message:e));}finally{setBusy(false);}}
 async function review(id:string,status:"paid"|"reversed"){const reference=(references[id]??"").trim();if(reference.length<8){setErr("اكتب مرجع تحويل أو سبب موثق لا يقل عن 8 أحرف.");return;}setBusy(true);setErr("");setNotice("");
  try{const r=await fetch("/api/admin/creator-commissions",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,status,reference})});
   const d=await r.json();if(!r.ok)throw Error(d.code??"REVIEW_FAILED");await refresh();setNotice(status==="paid"?"تم تسجيل صرف العمولة حسب مرجع التحويل المُدخل.":"تم إلغاء العمولة المعلقة وتسجيل السبب.");
  }catch(e){setErr(String(e instanceof Error?e.message:e));}finally{setBusy(false);}}
 return <section className="adminPanel" style={{marginTop:20,padding:16}}>
  <h2>{t("عمولات صناع المحتوى على اشتراكات المنصة")}</h2>
  <p>{t("تُنشأ العمولة بعد التأكد من استلام رسوم اشتراك مدفوع شهري/سنوي واعتماد طلب الدفع؛ لا تشمل الباقة المجانية أو مشتريات العملاء. الصرف النقدي إجراء يدوي مستقل لا يُنفذه هذا الزر.")}</p>
  {canEdit&&<div style={{display:"flex",gap:12,alignItems:"end",flexWrap:"wrap"}}>
   <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> {t("تفعيل احتساب العمولة على الدفعات القادمة")}</label>
   <label>{t("نسبة العمولة % (0 إلى 100)")} <input type="number" min="0" max="100" step="0.01" value={rate} onChange={e=>setRate(e.target.value)} /></label>
   <button type="button" disabled={busy||!Number.isFinite(Number(rate))} onClick={()=>void configure()}>{t("حفظ نسبة المنصة")}</button>
  </div>}
  <p>{t("المستحقات المسجلة:")} {rows.length} {t("دفعة، ويمكن مراجعة كل عملة على حدة.")}</p>
  <div style={{display:"grid",gap:12}}>{rows.map(item=><article key={item.id} style={{border:"1px solid #8886",borderRadius:10,padding:12}}>
   <strong>{item.creator_name}</strong> — {item.tenant_name} · {item.billing_cycle==="yearly"?t("سنوي"):t("شهري")}
   <p dir="ltr">{item.base_amount} {item.currency} × {(item.commission_basis_points/100).toFixed(2)}% = <b>{item.amount} {item.currency}</b></p>
   <p>{item.status==="earned"?t("مستحقة بانتظار الصرف"):item.status==="paid"?t("مدفوعة"):t("ملغاة")} {item.payout_reference&&" · "+item.payout_reference}</p>
   {canEdit&&item.status==="earned"&&<div style={{display:"flex",flexWrap:"wrap",gap:8}}>
    <input aria-label={t("مرجع التحويل أو سبب الإلغاء")} maxLength={160} minLength={8} placeholder={t("مرجع التحويل أو سبب الإلغاء")} value={references[item.id]??""} onChange={e=>setReferences(v=>({...v,[item.id]:e.target.value}))}/>
    <button disabled={busy} onClick={()=>void review(item.id,"paid")}>{t("تأكيد صرف العمولة بعد التحويل")}</button>
    <button disabled={busy} onClick={()=>void review(item.id,"reversed")}>{t("إلغاء المستحق")}</button>
   </div>}
  </article>)}</div>
  {notice&&<p role="status">{notice}</p>}{err&&<p role="alert">{err}</p>}
 </section>;
}
