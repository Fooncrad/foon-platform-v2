import {notFound,redirect} from "next/navigation";
import {cookies} from "next/headers";
import Link from "next/link";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {customerCreatorUserId} from "@/lib/creator/authorization";
import {database} from "@/lib/db/mysql";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default async function ReferralStatementPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const user=await currentUserId();if(!user)redirect("/login?next="+encodeURIComponent("/customer/creator/referrals/"+id));
 const creator=await customerCreatorUserId();if(!creator)notFound();
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT c.id,c.status,c.currency,c.amount,c.base_amount,c.commission_basis_points,c.created_at,c.paid_at,c.billing_cycle,c.payout_reference,t.name AS tenant_name,p.name_ar,p.name_en,p.name_fr "+
  "FROM customer_creator_commissions c JOIN tenants t ON t.id=c.tenant_id JOIN package_plans p ON p.id=c.plan_id "+
  "WHERE c.id=? AND c.creator_user_id=? LIMIT 1",[id,creator]);
 const statement=rows[0];if(!statement)notFound();
 const lang=(await cookies()).get("foon_language")?.value,t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 const plan=lang==="en"?statement.name_en:lang==="fr"?statement.name_fr:statement.name_ar;
 return <main lang={lang==="en"||lang==="fr"?lang:"ar"} dir={lang==="en"||lang==="fr"?"ltr":"rtl"} style={{maxWidth:720,margin:"32px auto",padding:24}}>
  <Link href="/customer/creator">{t("حساب صانع المحتوى","Creator account","Compte créateur")}</Link>
  <h1>{statement.status==="paid"?t("إثبات صرف عمولة إحالة","Referral commission payout receipt","Reçu de versement de commission"):t("كشف عمولة الإحالة","Referral commission statement","Relevé de commission")}</h1>
  <p>{t("مرجع العمولة","Commission reference","Référence de commission")}: <b dir="ltr">{String(statement.id)}</b></p>
  <dl>
   <dt>{t("المنشأة المُحالة","Referred business","Entreprise parrainée")}</dt><dd>{String(statement.tenant_name)}</dd>
   <dt>{t("الباقة","Plan","Formule")}</dt><dd>{String(plan)}</dd>
   <dt>{t("أساس العمولة","Commission basis","Base de commission")}</dt><dd dir="ltr">{Number(statement.base_amount).toFixed(2)} {String(statement.currency)}</dd>
   <dt>{t("نسبة العمولة","Commission rate","Taux de commission")}</dt><dd dir="ltr">{(Number(statement.commission_basis_points)/100).toFixed(2)}%</dd>
   <dt>{t("العمولة","Commission","Commission")}</dt><dd dir="ltr">{Number(statement.amount).toFixed(2)} {String(statement.currency)}</dd>
   <dt>{t("الحالة","Status","Statut")}</dt><dd>{statement.status==="earned"?t("مستحقة ولم تُصرف","Earned — not yet paid","Acquise — non versée"):statement.status==="paid"?t("مدفوعة","Paid","Versée"):t("ملغاة","Reversed","Annulée")}</dd>
   <dt>{t("تاريخ التسجيل","Recorded on","Enregistrée le")}</dt><dd>{new Date(statement.created_at).toLocaleDateString(lang==="en"?"en-GB":lang==="fr"?"fr-FR":"ar-SA-u-nu-latn")}</dd>
   {statement.paid_at&&<><dt>{t("تاريخ الصرف","Paid on","Versée le")}</dt><dd>{new Date(statement.paid_at).toLocaleDateString(lang==="en"?"en-GB":lang==="fr"?"fr-FR":"ar-SA-u-nu-latn")}</dd></>}
   {statement.status==="paid"&&statement.payout_reference&&<><dt>{t("مرجع الصرف","Payout reference","Référence de versement")}</dt><dd dir="ltr">{String(statement.payout_reference)}</dd></>}
  </dl>
  <p>{t("هذا كشف عمولة أو إثبات صرف وليس فاتورة بيع أو فاتورة ضريبية.","This is a commission statement or payout confirmation, not a sales or tax invoice.","Ce relevé ou justificatif de paiement n'est pas une facture de vente ou fiscale.")}</p>
 </main>;
}
