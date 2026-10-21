"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useUiLanguage} from "@/lib/i18n/ui-language";
type Invoice={id:string;invoice_number:string;invoice_kind:string;currency:string;total:string|number;issued_at:string;email_status:string;order_id:string;order_number:string};
export default function CustomerInvoiceArchive(){
 const lang=useUiLanguage(),t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 const [rows,setRows]=useState<Invoice[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 useEffect(()=>{let active=true;fetch("/api/customer/invoices",{cache:"no-store"}).then(async response=>{
  const data=await response.json();if(!response.ok||!data.ok)throw Error("INVOICES_UNAVAILABLE");
  if(active)setRows(data.invoices??[]);
 }).catch(()=>{if(active)setError(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 return <article className="customerOrderPanel" id="customer-invoices"><header><h2>{t("فواتيري وإيصالات الطلبات","My invoices and order receipts","Mes factures et reçus")}</h2></header>
  <p>{t("تصدر إيصالات الطلبات المدفوعة وتبقى في حسابك حتى لو تعذر إرسال البريد.","Paid order receipts remain in your account even if email delivery fails.","Vos reçus restent dans le compte même si l'e-mail échoue.")}</p>
  {loading?<p role="status">{t("جارٍ تحميل الإيصالات…","Loading receipts…","Chargement des reçus…")}</p>:
   error?<p role="alert">{t("تعذر تحميل الفواتير حاليًا.","Invoices are temporarily unavailable.","Factures indisponibles.")}</p>:
   rows.length?<div className="customerOrderList">{rows.map(row=><section className="customerOrderCard" key={row.id}><header><strong dir="ltr">{row.invoice_number}</strong><small>{t("إيصال دفع","Payment receipt","Reçu de paiement")}</small></header><p>{t("الطلب","Order","Commande")} #{row.order_number}</p>
    <p><strong dir="ltr">{Number(row.total).toFixed(2)} {row.currency}</strong></p>
    <p>{row.email_status==="sent"?t("أُرسل إلى البريد","Sent by email","Envoyé par e-mail"):row.email_status==="failed"?t("تعذر إرسال البريد، الإيصال محفوظ هنا","Email failed; receipt saved here","E-mail échoué ; reçu conservé"):row.email_status==="skipped"?t("الإيصال محفوظ في الحساب","Saved in your account","Enregistré dans le compte"):t("البريد قيد الإرسال","Email queued","E-mail en attente")}</p>
    <Link href={"/receipts/"+encodeURIComponent(row.order_id)}>{t("عرض الإيصال","View receipt","Voir le reçu")}</Link>
   </section>)}</div>:<p>{t("لا توجد إيصالات مدفوعة حتى الآن.","No paid receipts yet.","Aucun reçu payé pour le moment.")}</p>}
 </article>;
}
