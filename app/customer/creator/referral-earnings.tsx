"use client";
import {useEffect,useState} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
type Earning={id:string;tenant_name:string;plan_name:string;billing_cycle:string;currency:string;base_amount:string;commission_basis_points:number;amount:string;status:string;created_at:string};
export default function CreatorReferralEarnings({handle}:{handle:string}){
 const lang=useUiLanguage(),t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 const [rate,setRate]=useState(0),[enabled,setEnabled]=useState(false),[count,setCount]=useState(0),[items,setItems]=useState<Earning[]>([]),[err,setErr]=useState(""),[ready,setReady]=useState(false),[copied,setCopied]=useState(false);
 useEffect(()=>{let live=true;fetch("/api/account/creator-referrals",{cache:"no-store"}).then(async r=>{
  const d=await r.json();if(!r.ok||!d.ok)throw Error(String(d.code??"UNAVAILABLE"));
  if(live){setCount(d.referrals??0);setRate(Number(d.currentRate??0));setEnabled(Boolean(d.referralsEnabled));setItems(d.commissions??[]);}
 }).catch(()=>{if(live)setErr(t("تعذر تحميل الأرباح.","Earnings unavailable.","Gains indisponibles."));}).finally(()=>{if(live)setReady(true);});return()=>{live=false;};},[lang]);
 const link="/register?ref="+encodeURIComponent(handle);
 const totals:Record<string,{earned:number;paid:number;reversed:number}>={};
 for(const item of items){const currency=item.currency;const value=Math.round(Number(item.amount)*100);
  if(!totals[currency])totals[currency]={earned:0,paid:0,reversed:0};
  if(Number.isSafeInteger(value)&&value>=0){const key=item.status==="paid"?"paid":item.status==="reversed"?"reversed":"earned";totals[currency][key]+=value;}
 }
 return <section className="creatorReferralDashboard">
  <h2>{t("برنامج عمولة الإحالة","Creator referral commissions","Commissions de parrainage")}</h2>
  <p>{t("شارك رابط تسجيل المتاجر والمطاعم. العمولة تُكتسب على الاشتراكات المدفوعة الشهرية أو السنوية فقط، وبعد مراجعة الإدارة وتأكيد وصول الدفع. الدفع الفعلي للعمولة يتم لاحقًا بشكل منفصل.","Share your referral link with merchants. Earn only after verified paid monthly/yearly subscriptions. Commission payouts are a separate confirmed step.","Partagez ce lien. Les commissions sont comptées après validation du paiement mensuel ou annuel. Le versement est distinct.")}</p>
  <div className="creatorReferralLink"><code dir="ltr">{link}</code>
   <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(new URL(link,window.location.origin).toString());setCopied(true);}catch{setErr(t("تعذر نسخ الرابط.","Cannot copy link.","Copie impossible."));}}}>{copied?t("تم النسخ","Copied","Copié"):t("نسخ رابط الإحالة","Copy referral URL","Copier le lien")}</button>
  </div>
  {!ready?<p role="status">{t("جارٍ التحميل…","Loading…","Chargement…")}</p>:<>
   <p>{t("نسبة العمولة الحالية للدفعات القادمة:","Current commission rate on future approvals:","Taux de commission en vigueur :")} <b dir="ltr">{rate.toFixed(2)}%</b> {enabled?t("(مفعلة)","(enabled)","(activée)"):t("(غير مفعلة)","(disabled)","(désactivée)")}</p>
   <p>{t("المتاجر المسجلة برابطك:","Businesses registered via your link:","Entreprises inscrites :")} <b>{count}</b></p>
   {Object.entries(totals).map(([currency,sum])=><p key={currency} dir="ltr">{currency}: {t("مستحق","Earned","Gagné")} {(sum.earned/100).toFixed(2)} · {t("مدفوع","Paid","Payé")} {(sum.paid/100).toFixed(2)} · {t("ملغى","Reversed","Annulé")} {(sum.reversed/100).toFixed(2)}</p>)}
   <div className="creatorReferralRows">{items.map(item=><article key={item.id}><b>{item.tenant_name}</b> · <span>{item.plan_name}</span>
    <span dir="ltr">{item.amount} {item.currency}</span> · <span>{(item.commission_basis_points/100).toFixed(2)}%</span> ·
    <span>{item.billing_cycle==="yearly"?t("سنوي","Yearly","Annuel"):t("شهري","Monthly","Mensuel")}</span> ·
    <strong>{item.status==="paid"?t("مدفوعة","Paid","Payée"):item.status==="reversed"?t("ملغاة","Reversed","Annulée"):t("مستحقة ولم تُصرف","Earned, unpaid","Due, non versée")}</strong>
   </article>)}</div>
   {items.length===0&&<p>{t("لا توجد عمولات مستحقة بعد.","No commissions earned yet.","Pas de commission pour le moment.")}</p>}
  </>}
  {err&&<p role="alert">{err}</p>}
 </section>;
}
