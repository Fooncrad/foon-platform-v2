import { redirect } from "next/navigation";
import CreatePlanForm from "./create-plan-form";
import type { RowDataPacket } from "mysql2/promise";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";

export default async function PlansPage(){
 const userId=await currentActiveAdminUserId();if(!userId)redirect("/login");
 const {role}=await requirePlatformRole(userId,["super_admin","admin","support"]);
 let plans:RowDataPacket[]=[];let available=true;
 try{
  const [rows]=await database().execute<RowDataPacket[]>(
   "SELECT p.id,p.code,p.name_ar,p.name_en,p.enabled,p.sort_order,COUNT(DISTINCT pr.id) AS price_count,COUNT(DISTINCT pf.feature_key) AS feature_count FROM package_plans p LEFT JOIN package_plan_prices pr ON pr.plan_id=p.id LEFT JOIN package_plan_features pf ON pf.plan_id=p.id GROUP BY p.id,p.code,p.name_ar,p.name_en,p.enabled,p.sort_order ORDER BY p.sort_order,p.code LIMIT 100");
  plans=rows;
 }catch{available=false;}
 return <main className="workspace" dir="rtl">
  <header className="workspace-head"><div><h1>الباقات والمميزات</h1><p>كتالوج الباقات الفعلي، دون أسعار أو مزايا افتراضية.</p></div></header>
  <section className="adminPanel"><div className="adminPanelHead"><div><h2>الباقات المسجلة</h2><p>قراءة مباشرة من قاعدة البيانات. إنشاء الباقات وتعديلها لم يُفعّلا بعد.</p></div></div>
  {!available?<div className="adminUsersEmpty" role="status"><b>كتالوج الباقات غير جاهز</b><p>قد تكون جداول الباقات لم تُرحّل بعد. الترحيل مؤجل حسب خطة الإطلاق، ولن يُنفذ تلقائيًا.</p></div>:
   plans.length===0?<div className="adminUsersEmpty" role="status"><b>لا توجد باقات مسجلة</b><p>سيظهر الكتالوج هنا بعد إعداد البيانات.</p></div>:
   <div className="workspace-grid">{plans.map(plan=><article key={String(plan.id)}><strong>{String(plan.name_ar)}</strong><span>{String(plan.name_en)} · {String(plan.code)}</span><span>{plan.enabled?"مفعّلة":"معطّلة"}</span><small>الأسعار: {String(plan.price_count)} · المميزات: {String(plan.feature_count)}</small></article>)}</div>}
  </section>
  {role!=="support"&&<section className="adminPanel"><h2>إنشاء باقة جديدة</h2><CreatePlanForm/></section>}
 </main>;
}
