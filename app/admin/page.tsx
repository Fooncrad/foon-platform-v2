import Link from "next/link";
import {cookies} from "next/headers";
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
 {href:"/admin/landing-editor",icon:"✎",title:"محرر واجهة الموقع",description:"النصوص والصور والأقسام بكل اللغات"},
 {href:"/admin/media",icon:"▧",title:"مكتبة الصور والمساحات",description:"تخصيص سعة الصور لجميع الحسابات"},
 {href:"/admin/settings",icon:"⚙",title:"إعدادات المنصة",description:"الهوية والإعدادات العامة"},
 {href:"/admin/audit",icon:"≡",title:"سجل العمليات",description:"مراجعة الأنشطة والتغييرات"}
];
const adminTranslations:Record<string,{en:string;fr:string}>={
 "المتاجر":{en:"Stores",fr:"Boutiques"},
 "إدارة الأنشطة والفروع والحالة":{en:"Manage businesses, branches and status",fr:"Gérer les activités, succursales et statuts"},
 "الباقات والمميزات":{en:"Plans and features",fr:"Offres et fonctionnalités"},
 "الخطط والأسعار والصلاحيات":{en:"Plans, pricing and permissions",fr:"Offres, tarifs et autorisations"},
 "الاشتراكات":{en:"Subscriptions",fr:"Abonnements"},
 "تعيين الباقات والتجديد":{en:"Assign plans and renewals",fr:"Attribution et renouvellement des offres"},
 "المدفوعات والفواتير":{en:"Payments and invoices",fr:"Paiements et factures"},
 "المعاملات والسجلات":{en:"Transactions and records",fr:"Transactions et registres"},
 "المستخدمون والصلاحيات":{en:"Users and permissions",fr:"Utilisateurs et autorisations"},
 "الحسابات والأدوار":{en:"Accounts and roles",fr:"Comptes et rôles"},
 "الإشعارات والرسائل":{en:"Notifications and messages",fr:"Notifications et messages"},
 "التنبيهات وقنوات التواصل":{en:"Alerts and communication channels",fr:"Alertes et canaux de communication"},
 "الترجمات":{en:"Translations",fr:"Traductions"},
 "العربية والإنجليزية والفرنسية":{en:"Arabic, English and French",fr:"Arabe, anglais et français"},
 "صفحات الموقع":{en:"Website pages",fr:"Pages du site"},
 "محرر واجهة الموقع":{en:"Homepage editor",fr:"Éditeur d’accueil"},
 "النصوص والصور والأقسام بكل اللغات":{en:"Text, images and sections in all languages",fr:"Textes, images et sections dans toutes les langues"},
 "إدارة المحتوى العام":{en:"Manage public content",fr:"Gérer le contenu public"},
 "مكتبة الصور والمساحات":{en:"Media library and storage",fr:"Médiathèque et stockage"},
 "تخصيص سعة الصور لجميع الحسابات":{en:"Manage image storage for all accounts",fr:"Gérer le stockage des images des comptes"},
 "إعدادات المنصة":{en:"Platform settings",fr:"Paramètres de la plateforme"},
 "الهوية والإعدادات العامة":{en:"Branding and general settings",fr:"Identité et paramètres généraux"},
 "سجل العمليات":{en:"Audit log",fr:"Journal d’audit"},
 "مراجعة الأنشطة والتغييرات":{en:"Review activity and changes",fr:"Examiner les activités et modifications"},
 "إدارة المنصة":{en:"Platform administration",fr:"Administration de la plateforme"},
 "نظرة عامة":{en:"Overview",fr:"Vue d’ensemble"},
 "ملخص النشاط والوصول السريع إلى أدوات FOON.":{en:"Activity summary and quick access to FOON tools.",fr:"Résumé des activités et accès rapide aux outils FOON."},
 "إدارة المتاجر ←":{en:"Manage stores ←",fr:"Gérer les boutiques ←"},
 "مؤشرات المتاجر":{en:"Store metrics",fr:"Indicateurs des boutiques"},
 "إجمالي المتاجر":{en:"Total stores",fr:"Total des boutiques"},
 "كل الأنشطة المسجلة":{en:"All registered businesses",fr:"Toutes les activités enregistrées"},
 "متاجر نشطة":{en:"Active stores",fr:"Boutiques actives"},
 "تعمل بعد التسجيل مباشرة":{en:"Active after registration",fr:"Actives après inscription"},
 "غير مفعّلة":{en:"Not activated",fr:"Non activées"},
 "تحتاج مراجعة سبب عدم التفعيل":{en:"Activation needs review",fr:"Activation à examiner"},
 "متاجر موقوفة":{en:"Suspended stores",fr:"Boutiques suspendues"},
 "تتطلب مراجعة":{en:"Review required",fr:"Examen nécessaire"},
 "مؤشرات التشغيل":{en:"Operations metrics",fr:"Indicateurs opérationnels"},
 "الحسابات المسجلة":{en:"Registered accounts",fr:"Comptes inscrits"},
 "النشطة: ":{en:"Active: ",fr:"Actifs : "},
 " · المعلقة: ":{en:" · Pending: ",fr:" · En attente : "},
 "البيانات غير متاحة":{en:"Data unavailable",fr:"Données indisponibles"},
 "آخر نشاط إداري":{en:"Latest admin activity",fr:"Dernière activité administrative"},
 "آخر خمس عمليات":{en:"Last five actions",fr:"Cinq dernières actions"},
 "آخر العمليات":{en:"Recent actions",fr:"Actions récentes"},
 "بيانات حقيقية من سجل التدقيق.":{en:"Real records from the audit log.",fr:"Données réelles du journal d’audit."},
 "السجل الكامل ←":{en:"Full log ←",fr:"Journal complet ←"},
 "لا توجد عمليات مسجلة للعرض.":{en:"No recorded actions to display.",fr:"Aucune action enregistrée à afficher."},
 "أقسام الإدارة":{en:"Administration sections",fr:"Sections d’administration"},
 "كل قسم مستقل، افتحه عند الحاجة دون ازدحام الصفحة الرئيسية.":{en:"Each section opens independently to keep the overview uncluttered.",fr:"Chaque section s’ouvre séparément pour garder une vue d’ensemble claire."},
};
export default async function AdminPage(){
 const stored=(await cookies()).get("foon_language")?.value;
 const language=stored==="en"||stored==="fr"?stored:"ar";
 const t=(ar:string)=>language==="ar"?ar:adminTranslations[ar]?.[language]??ar;
 const id=await currentActiveAdminUserId();if(!id)redirect("/login");
 try{await requirePlatformRole(id,["super_admin","admin","support"])}catch{redirect("/account")}
 const [rows]=await database().execute<RowDataPacket[]>("SELECT COUNT(*) total,SUM(status='active') active,SUM(status='pending') pending,SUM(status='suspended') suspended FROM tenants");
 const s=rows[0]??{};
 const [accounts]=await database().execute<RowDataPacket[]>("SELECT COUNT(*) total,SUM(status='active') active FROM users");
 const a=accounts[0]??{};
 let subscription:RowDataPacket|null=null;
 try{const [sub]=await database().execute<RowDataPacket[]>("SELECT COUNT(*) total,SUM(status='active') active,SUM(status='pending') pending FROM tenant_subscriptions");subscription=sub[0]??null;}catch{}
 let latest:RowDataPacket[]=[];
 try{const [logs]=await database().execute<RowDataPacket[]>("SELECT e.action,e.created_at,u.email FROM platform_audit_events e JOIN users u ON u.id=e.actor_user_id ORDER BY e.created_at DESC LIMIT 5");latest=logs;}catch{}

 return <main className="workspace adminDashboard" dir={language==="ar"?"rtl":"ltr"}>
  <header className="workspace-head adminDashboardHead"><div><span className="adminEyebrow">{t("إدارة المنصة")}</span><h1>{t("نظرة عامة")}</h1><p>{t("ملخص النشاط والوصول السريع إلى أدوات FOON.")}</p></div><Link className="adminPrimaryLink" href="/admin/tenants">{t("إدارة المتاجر ←")}</Link></header>
  <section aria-label={t("مؤشرات المتاجر")} className="adminMetrics">
   <Link href="/admin/tenants" className="adminMetric"><span>{t("إجمالي المتاجر")}</span><strong>{Number(s.total??0)}</strong><small>{t("كل الأنشطة المسجلة")}</small></Link>
   <div className="adminMetric"><span>{t("متاجر نشطة")}</span><strong>{Number(s.active??0)}</strong><small>{t("تعمل بعد التسجيل مباشرة")}</small></div>
   <div className="adminMetric"><span>{t("غير مفعّلة")}</span><strong>{Number(s.pending??0)}</strong><small>{t("تحتاج مراجعة سبب عدم التفعيل")}</small></div>
   <div className="adminMetric"><span>{t("متاجر موقوفة")}</span><strong>{Number(s.suspended??0)}</strong><small>{t("تتطلب مراجعة")}</small></div>
  </section>
  <section className="adminOverviewSecondary" aria-label={t("مؤشرات التشغيل")}>
   <article><span>{t("الحسابات المسجلة")}</span><strong>{Number(a.total??0)}</strong><small>{t("النشطة: ")}{Number(a.active??0)}</small></article>
   <article><span>{t("الاشتراكات")}</span><strong>{subscription?Number(subscription.total??0):"—"}</strong><small>{subscription?t("النشطة: ")+Number(subscription.active??0)+t(" · المعلقة: ")+Number(subscription.pending??0):t("البيانات غير متاحة")}</small></article>
   <article><span>{t("آخر نشاط إداري")}</span><strong>{latest.length}</strong><small>{t("آخر خمس عمليات")}</small></article>
  </section>
  <section className="adminPanel adminRecentActivity"><div className="adminPanelHead"><div><h2>{t("آخر العمليات")}</h2><p>{t("بيانات حقيقية من سجل التدقيق.")}</p></div><Link href="/admin/audit">{t("السجل الكامل ←")}</Link></div>
  {latest.length?<div className="adminRecentList">{latest.map((event,i)=><div key={i}><strong>{String(event.action)}</strong><span dir="ltr">{String(event.email)}</span><time dateTime={new Date(event.created_at).toISOString()}>{new Date(event.created_at).toLocaleString("en-GB",{timeZone:"UTC"})} UTC</time></div>)}</div>:<p>{t("لا توجد عمليات مسجلة للعرض.")}</p>}
  </section>
  <section className="adminModules"><div className="adminSectionHeading"><div><h2>{t("أقسام الإدارة")}</h2><p>{t("كل قسم مستقل، افتحه عند الحاجة دون ازدحام الصفحة الرئيسية.")}</p></div></div>
   <div className="adminModulesGrid">{modules.map(module=><Link className="adminModuleCard" key={module.href} href={module.href}><span className="adminModuleIcon" aria-hidden="true">{module.icon}</span><span className="adminModuleContent"><b>{t(module.title)}</b><small>{t(module.description)}</small></span><span className="adminModuleArrow" aria-hidden="true">‹</span></Link>)}</div>
  </section>
 </main>;
}
