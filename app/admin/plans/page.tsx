import {cookies as uiCookies} from "next/headers";
import {uiText} from "@/lib/i18n/ui-copy";
import { redirect } from "next/navigation";
import CreatePlanForm from "./create-plan-form";
import PlanPrices from "./plan-prices";
import PlanFeatures from "./plan-features";
import BootstrapPlans from "./bootstrap-plans";
import type { RowDataPacket } from "mysql2/promise";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";

export default async function PlansPage(){
 const translationLanguage=(await uiCookies()).get("foon_language")?.value;
 const translateUi=(value:string)=>uiText(value,translationLanguage==="en"||translationLanguage==="fr"?translationLanguage:"ar");

 const userId=await currentActiveAdminUserId();if(!userId)redirect("/login");
 const {role}=await requirePlatformRole(userId,["super_admin","admin","support"]);
 let plans:RowDataPacket[]=[];let available=true;
 try{
  const [rows]=await database().execute<RowDataPacket[]>(
   "SELECT p.id,p.code,p.name_ar,p.name_en,p.name_fr,p.enabled,p.sort_order,COUNT(DISTINCT pr.id) AS price_count,COUNT(DISTINCT pf.feature_key) AS feature_count FROM package_plans p LEFT JOIN package_plan_prices pr ON pr.plan_id=p.id LEFT JOIN package_plan_features pf ON pf.plan_id=p.id GROUP BY p.id,p.code,p.name_ar,p.name_en,p.name_fr,p.enabled,p.sort_order ORDER BY p.sort_order,p.code LIMIT 100");
  plans=rows;
 }catch{available=false;}
 return <main className="workspace">
  <header className="workspace-head"><div><h1>{translateUi("الباقات والمميزات")}</h1><p>{translateUi("كتالوج الباقات الفعلي، دون أسعار أو مزايا افتراضية.")}</p></div></header>
  <section className="adminPanel"><div className="adminPanelHead"><div><h2>{translateUi("الباقات المسجلة")}</h2><p>{translateUi("الباقات والمميزات والأسعار تُقرأ من قاعدة البيانات، ويمكن إدارتها حسب صلاحيات الحساب.")}</p></div></div>
  {!available?<div className="adminUsersEmpty" role="status"><b>{translateUi("كتالوج الباقات غير جاهز")}</b><p>{translateUi("قد تكون جداول الباقات لم تُرحّل بعد. الترحيل مؤجل حسب خطة الإطلاق، ولن يُنفذ تلقائيًا.")}</p></div>:
   plans.length===0?<div className="adminUsersEmpty" role="status"><b>{translateUi("لا توجد باقات مسجلة")}</b><p>{translateUi("اضغط «إنشاء الباقات الأربع وتوزيع المميزات» أدناه لإضافة الباقات الافتراضية دون تغيير أي إعدادات موجودة.")}</p></div>:
   <div className="adminPlansCatalog">{plans.map(plan=><article className="adminPlanCatalogCard" key={String(plan.id)}><strong>{String(translationLanguage==="en"?plan.name_en:translationLanguage==="fr"?plan.name_fr:plan.name_ar)}</strong><span>{String(plan.name_en)} · {String(plan.code)}</span><span>{plan.enabled?translateUi("مفعّلة"):translateUi("معطّلة")}</span><small>{translateUi("الأسعار:")} {String(plan.price_count)}  {translateUi("· المميزات:")} {String(plan.feature_count)}</small><PlanPrices planId={String(plan.id)} canEdit={role!=="support"} isFree={String(plan.code)==="free"}/><PlanFeatures planId={String(plan.id)} canEdit={role!=="support"}/></article>)}</div>}
  </section>
  {role!=="support"&&<section className="adminPanel adminPlansSetup"><h2>{translateUi("إدارة الكتالوج")}</h2><p>{translateUi("أضف الباقات الأساسية عند الحاجة، أو افتح النموذج لإنشاء باقة إضافية.")}</p><BootstrapPlans/><details className="adminPlanCreateDetails"><summary>{translateUi("إنشاء باقة جديدة")}</summary><CreatePlanForm/></details></section>}
 </main>;
}
