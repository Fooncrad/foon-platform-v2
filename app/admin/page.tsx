import Link from "next/link";
import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";

const modules=[
 {href:"/admin/tenants",icon:"▦",title:"المتاجر",description:"إدارة الأنشطة والفروع والحالة"},
 {href:"/admin/plans",icon:"◈",title:"الباقات والمميزات",description:"الخطط والأسعار والصلاحيات"},
 {href:"/admin/subscriptions",icon:"◷",title:"الاشتراكات",description:"تعيين الباقات والتجديد"},
 {href:"/admin/billing",icon:"▤",title:"المدفوعات والفواتير",description:"المعاملات والسجلات"},
 {href:"/admin/users",icon:"♙",title:"المستخدمون والصلاحيات",description:"الحسابات والأدوار"},
 {href:"/admin/notifications",icon:"♧",title:"الإشعارات والرسائل",description:"التنبيهات وقنوات التواصل"},
 {href:"/admin/translations",icon:"文",title:"الترجمات",description:"العربية والإنجليزية والفرنسية"},
 {href:"/admin/pages",icon:"▧",title:"صفحات الموقع",description:"إدارة المحتوى العام"},
 {href:"/admin/settings",icon:"⚙",title:"إعدادات المنصة",description:"الهوية والإعدادات العامة"},
 {href:"/admin/audit",icon:"≡",title:"سجل العمليات",description:"مراجعة الأنشطة والتغييرات"}
];
export default async function AdminPage(){
 const id=await currentActiveAdminUserId();if(!id)redirect("/login");
 try{await requirePlatformRole(id,["super_admin","admin","support"])}catch{redirect("/account")}
 const [rows]=await database().execute<RowDataPacket[]>("SELECT COUNT(*) total,SUM(status='active') active,SUM(status='pending') pending,SUM(status='suspended') suspended FROM tenants");
 const s=rows[0]??{};
 return <main className="workspace adminDashboard" dir="rtl">
  <header className="workspace-head adminDashboardHead"><div><span className="adminEyebrow">إدارة المنصة</span><h1>نظرة عامة</h1><p>ملخص النشاط والوصول السريع إلى أدوات FOON.</p></div><Link className="adminPrimaryLink" href="/admin/tenants">إدارة المتاجر ←</Link></header>
  <section aria-label="مؤشرات المتاجر" className="adminMetrics">
   <Link href="/admin/tenants" className="adminMetric"><span>إجمالي المتاجر</span><strong>{Number(s.total??0)}</strong><small>كل الأنشطة المسجلة</small></Link>
   <div className="adminMetric"><span>متاجر نشطة</span><strong>{Number(s.active??0)}</strong><small>جاهزة للتشغيل</small></div>
   <div className="adminMetric"><span>قيد المراجعة</span><strong>{Number(s.pending??0)}</strong><small>بانتظار الاعتماد</small></div>
   <div className="adminMetric"><span>متاجر موقوفة</span><strong>{Number(s.suspended??0)}</strong><small>تتطلب مراجعة</small></div>
  </section>
  <section className="adminModules"><div className="adminSectionHeading"><div><h2>أقسام الإدارة</h2><p>كل قسم مستقل، افتحه عند الحاجة دون ازدحام الصفحة الرئيسية.</p></div></div>
   <div className="adminModulesGrid">{modules.map(module=><Link className="adminModuleCard" key={module.href} href={module.href}><span className="adminModuleIcon" aria-hidden="true">{module.icon}</span><span className="adminModuleContent"><b>{module.title}</b><small>{module.description}</small></span><span className="adminModuleArrow" aria-hidden="true">‹</span></Link>)}</div>
  </section>
 </main>;
}
