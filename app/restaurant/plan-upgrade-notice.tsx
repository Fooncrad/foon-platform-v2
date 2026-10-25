"use client";
import Link from "next/link";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import {activitySectionUrl} from "@/lib/tenant/workspace-routes";

export function isUpgradeError(code:unknown):boolean{
 return code==="PLAN_LIMIT_REACHED"||code==="PLAN_FEATURE_REQUIRED";
}

/** A visible recovery path for entitlement blocks across all tenant activities.
 * Links to existing owner-approved paid subscription review, never bypasses a plan limit.
 */
export default function PlanUpgradeNotice({activity,code="PLAN_LIMIT_REACHED",context="catalog"}:{activity:string;code?:string;context?:"catalog"|"import"|"general"}){
 const lang=useUiLanguage();
 const t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 if(!isUpgradeError(code))return null;
 const unavailable=code==="PLAN_FEATURE_REQUIRED";
 const detail=unavailable?t("هذه الميزة غير متاحة في باقتك الحالية.","This feature is not included in your current plan.","Cette fonctionnalité n’est pas comprise dans votre formule."):
 context==="import"?t("بلغت الحد المسموح في الباقة أثناء الاستيراد. بيانات الدفعات المحفوظة لا تُحذف.","Your import reached your plan limit. Previously saved rows are preserved.","L’importation a atteint la limite de votre formule. Les lignes déjà enregistrées sont conservées."):
 t("وصلت إلى الحد المتاح في باقتك لإضافة أقسام أو منتجات جديدة.","Your plan's category or product limit has been reached.","Vous avez atteint la limite de catégories ou d’articles de votre formule.");
 return <aside className="foonPlanUpgradeNotice" role="alert" style={{display:"grid",gap:9,padding:14,marginBlock:12,border:"1px solid #d8a73c",borderInlineStart:"4px solid #d8a73c",borderRadius:13,background:"color-mix(in srgb,#e2a93b 9%,var(--surface,#fff))",maxWidth:"100%"}}>
  <strong>{t("يمكنك طلب ترقية الباقة","You can request a plan upgrade","Vous pouvez demander une formule supérieure")}</strong>
  <p style={{margin:0,lineHeight:1.8}}>{detail} {t("اختر باقة أعلى من «الباقة والمميزات». لا تُفعّل الباقة المدفوعة إلا بعد اعتماد الدفع من إدارة FOON.","Select a suitable paid plan under Plans & features. Activation requires FOON's payment approval.","Choisissez une formule adaptée. L’activation nécessite la validation du paiement par FOON.")}</p>
  <Link href={activitySectionUrl(activity,"subscription")} style={{width:"fit-content",padding:"10px 15px",borderRadius:10,background:"#e2a93b",color:"#171613",textDecoration:"none",fontWeight:800}}>
   {t("عرض الباقات وطلب الترقية","View plans and request upgrade","Voir les formules et demander une mise à niveau")}
  </Link>
  <small>{t("مالك النشاط وحده يرسل طلب الاشتراك؛ يستطيع المدير مراجعة الباقات.","Only the business owner can submit a subscription request.","Seul le propriétaire peut demander un abonnement.")}</small>
 </aside>;
}
