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
export default async function RestaurantPage(){
 const id=await currentUserId();if(!id)redirect("/login");
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT m.tenant_id,m.role,t.name FROM memberships m JOIN tenants t ON t.id=m.tenant_id JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND m.status='active' AND t.status='active' AND u.status='active' ORDER BY m.created_at LIMIT 1",[id]);
 const membership=rows[0];if(!membership)redirect("/account");
 const tenantId=String(membership.tenant_id),role=String(membership.role);
 const [branches]=await database().execute<RowDataPacket[]>(
  "SELECT name,slug,enabled FROM branches WHERE tenant_id=? ORDER BY created_at",[tenantId]);
 const panels=workspaces[role]??[];
 return <main className="workspace" dir="rtl">
  <header className="workspace-head"><div><span className="auth-brand">FOON</span><h1>{String(membership.name)}</h1><p>مساحة العمل · {role}</p></div><Link href="/account">حسابي</Link></header>
  <section aria-label="مجالات العمل" className="workspace-grid">{panels.map(panel=><article key={panel.title}><strong>{panel.title}</strong><span>{panel.description}</span><small>قيد التطوير — لا توجد إجراءات تشغيلية متاحة بعد</small></article>)}</section>
  {(role==="owner"||role==="manager")&&<section aria-label="الفروع"><h2>فروع المتجر</h2><p>عدد الفروع: {branches.length}</p><div className="workspace-grid">{branches.map(branch=><article key={String(branch.slug)}><strong>{String(branch.name)}</strong><span>{String(branch.slug)}</span><small>{branch.enabled?"مفعّل":"معطّل"}</small></article>)}</div>{branches.length===0&&<p>لا توجد فروع مسجلة بعد.</p>}</section>}
 </main>;
}
