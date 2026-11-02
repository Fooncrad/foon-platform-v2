import PrintReceiptButton from "@/app/components/print-receipt-button";
import {notFound,redirect} from "next/navigation";
import Link from "next/link";
import {cookies} from "next/headers";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default async function SubscriptionReceiptPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const user=await currentUserId();if(!user)redirect("/login?next="+encodeURIComponent("/tenant/subscription-receipts/"+id));
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT r.receipt_number,r.amount,r.currency,r.issued_at,p.billing_cycle,t.id AS tenant_id,t.name AS tenant_name,pl.name_ar,pl.name_en,pl.name_fr FROM platform_payment_receipts r "+
  "JOIN platform_payment_requests p ON p.id=r.payment_request_id AND p.tenant_id=r.tenant_id AND p.status='approved' "+
  "JOIN tenants t ON t.id=r.tenant_id JOIN package_plans pl ON pl.id=p.plan_id WHERE r.payment_request_id=? LIMIT 1",[id]);
 const receipt=rows[0];if(!receipt)notFound();
 try{const membership=await requireTenantMembership(user,String(receipt.tenant_id),["owner"],false);if(membership.adminAccess)notFound();}catch{notFound();}
 const lang=(await cookies()).get("foon_language")?.value,t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 const plan=lang==="en"?receipt.name_en:lang==="fr"?receipt.name_fr:receipt.name_ar;
 return <main lang={lang==="en"||lang==="fr"?lang:"ar"} dir={lang==="en"||lang==="fr"?"ltr":"rtl"} style={{maxWidth:720,margin:"32px auto",padding:24}}>
  <style>{`@media print {.receiptPrintButton,.receiptPrintNav{display:none!important} body{background:white!important;color:black!important} main{padding:0!important;margin:0!important}}`}</style>
  <PrintReceiptButton label={t("طباعة / حفظ PDF","Print / Save as PDF","Imprimer / enregistrer en PDF")}/>
  <nav className="receiptPrintNav"><Link href="/account">{t("حسابي","My account","Mon compte")}</Link></nav>
  <Link href="/account">{t("حسابي","My account","Mon compte")}</Link>
  <h1>{t("إيصال اشتراك FOON","FOON subscription receipt","Reçu d'abonnement FOON")}</h1>
  <p><b dir="ltr">{String(receipt.receipt_number)}</b></p>
  <dl>
   <dt>{t("المنشأة","Business","Entreprise")}</dt><dd>{String(receipt.tenant_name)}</dd>
   <dt>{t("الباقة","Plan","Formule")}</dt><dd>{String(plan)}</dd>
   <dt>{t("الدورة","Billing cycle","Période")}</dt><dd>{receipt.billing_cycle==="yearly"?t("سنوية","Yearly","Annuelle"):t("شهرية","Monthly","Mensuelle")}</dd>
   <dt>{t("المبلغ المدفوع","Amount paid","Montant payé")}</dt><dd dir="ltr">{Number(receipt.amount).toFixed(2)} {String(receipt.currency)}</dd>
   <dt>{t("تاريخ الإصدار","Issued on","Date d'émission")}</dt><dd>{new Date(receipt.issued_at).toLocaleString(lang==="en"?"en-GB":lang==="fr"?"fr-FR":"ar-SA-u-nu-latn")}</dd>
  </dl>
  <p>{t("هذا إيصال دفع إداري ولا يُعد فاتورة ضريبية معتمدة.","This administrative payment receipt is not a certified tax invoice.","Ce reçu administratif n'est pas une facture fiscale certifiée.")}</p>
 </main>;
}
