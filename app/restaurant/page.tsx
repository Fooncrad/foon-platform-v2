import {resolveWorkspace} from "@/lib/tenant/workspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { RowDataPacket } from "mysql2/promise";
import { currentUserId } from "@/lib/auth/session";
import { database } from "@/lib/db/mysql";

const workspaces: Record<string,{title:string;description:string}[]> = {
 owner:[{title:"الفروع",description:"متابعة الفروع المفعّلة وحالتها"},{title:"المنيو والقوالب",description:"تخصيص القوائم والهوية حسب الباقة"},{title:"الطلبات ونقاط البيع",description:"تشغيل الطلبات والمحاسبة"},{title:"الحجوزات والطاولات",description:"تنظيم الحضور والانتظار وخدمة النادل"},{title:"الفريق والصلاحيات",description:"إدارة حسابات الموظفين"}],
 manager:[{title:"الفروع",description:"متابعة تشغيل الفروع"},{title:"المنيو",description:"الأقسام والأصناف والأسعار"},{title:"الطلبات",description:"الطلبات المباشرة وحالاتها"},{title:"الحجوزات والطاولات",description:"تنظيم الحضور وخدمة النادل"}],
 cashier:[{title:"نقطة البيع",description:"الفواتير والمدفوعات"},{title:"الطلبات",description:"استلام الطلبات وتحديث حالاتها"}],
 waiter:[{title:"الطاولات",description:"متابعة الطاولات المسندة"},{title:"طلبات الصالة",description:"خدمة الضيوف ونداءات النادل"}],
 kitchen:[{title:"شاشة المطبخ",description:"تحضير الطلبات وتحديث حالاتها"}],
 driver:[{title:"التوصيل",description:"الطلبات المسندة وحالات التسليم"}],
 accountant:[{title:"الفوترة",description:"الفواتير والمدفوعات والتقارير"}],
};
export default async function RestaurantPage({searchParams}:{searchParams:Promise<{tenant?:string}>}){
 const id=await currentUserId();if(!id)redirect("/login");
 const {tenant}=await searchParams;
 let membership;try{membership=await resolveWorkspace(id,tenant);}catch{redirect("/account");}
 const tenantId=String(membership.tenant_id),role=String(membership.role);
 const [branches]=await database().execute<RowDataPacket[]>(
  "SELECT name,slug,enabled FROM branches WHERE tenant_id=? ORDER BY created_at",[tenantId]);
 const panels=workspaces[role]??[];
 const [subscriptionRows]=await database().execute<RowDataPacket[]>(
  "SELECT p.name_ar AS plan_name,s.status,s.ends_at FROM tenant_subscriptions s JOIN package_plans p ON p.id=s.plan_id WHERE s.tenant_id=? LIMIT 1",[tenantId]);
 const subscription=subscriptionRows[0];
 const [features]=await database().execute<RowDataPacket[]>(
  "SELECT f.feature_key,f.name_ar,pf.enabled,pf.limit_value FROM package_features f LEFT JOIN tenant_subscriptions s ON s.tenant_id=? AND s.status='active' AND (s.starts_at IS NULL OR s.starts_at<=NOW()) AND (s.ends_at IS NULL OR s.ends_at>NOW()) LEFT JOIN package_plans p ON p.id=s.plan_id AND p.enabled=TRUE LEFT JOIN package_plan_features pf ON pf.plan_id=p.id AND pf.feature_key=f.feature_key ORDER BY f.category,f.feature_key",[tenantId]);
 return <main className="workspace merchantWorkspace" dir="rtl">
  <header className="workspace-head"><div><span className="auth-brand">FOON</span><h1>{String(membership.name)}</h1><p>مساحة العمل · {membership.adminAccess?"دخول المشرف الأعلى":role}</p></div><Link href={membership.adminAccess?"/admin/tenants":"/account"}>{membership.adminAccess?"العودة للإدارة":"حسابي"}</Link></header>
  {(role==="owner"||role==="manager")&&<section className="adminPanel" aria-label="اشتراك النشاط"><h2>الباقة والمميزات</h2><p>الباقة: {subscription?String(subscription.plan_name):"غير معينة"} · الحالة: {subscription?String(subscription.status):"لا يوجد اشتراك"}</p><p>المميزات المسموحة والمقفلة تُقرأ مباشرة من اشتراك النشاط.</p><details className="merchantFeatureDetails"><summary>عرض مميزات الباقة ({features.length})</summary><div className="workspace-grid">{features.map(feature=><article key={String(feature.feature_key)}><strong>{String(feature.name_ar)}</strong><span>{Boolean(feature.enabled)?"متاحة ضمن الباقة":"غير متاحة ضمن الباقة"}</span>{feature.limit_value!==null&&feature.limit_value!==undefined&&<small>الحد: {String(feature.limit_value)}</small>}</article>)}</div></details></section>}
  {(role==="owner"||role==="manager"||role==="accountant")&&<section className="adminPanel"><h2>المدفوعات المستقلة</h2><p>إعدادات مزود الدفع خاصة بهذه المنشأة، ولا ترتبط ببوابة اشتراكات FOON.</p><Link href={"/restaurant/payments?tenant="+encodeURIComponent(tenantId)}>إعدادات الدفع ←</Link></section>}
  <section aria-label="مجالات العمل" className="workspace-grid">{panels.map(panel=><article key={panel.title}><strong>{panel.title}</strong><span>{panel.description}</span><small>قيد التطوير — لا توجد إجراءات تشغيلية متاحة بعد</small></article>)}</section>
  {(role==="owner"||role==="manager")&&<section aria-label="الفروع"><h2>فروع المتجر</h2><p>عدد الفروع: {branches.length}</p><div className="workspace-grid">{branches.map(branch=><article key={String(branch.slug)}><strong>{String(branch.name)}</strong><span>{String(branch.slug)}</span><small>{branch.enabled?"مفعّل":"معطّل"}</small></article>)}</div>{branches.length===0&&<p>لا توجد فروع مسجلة بعد.</p>}</section>}
 </main>;
}
