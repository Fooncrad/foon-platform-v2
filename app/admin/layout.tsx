"use client";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import {useWorkspaceTheme} from "@/lib/ux/use-workspace-theme";
import WorkspaceThemeControl from "@/app/workspace-theme-control";
import Link from "next/link";
import {useEffect,useState} from "react";
import AccountLanguageSwitcher from "@/app/restaurant/account-language-switcher";
import TranslationLeakMonitor from "./translation-leak-monitor";
import {usePathname} from "next/navigation";
import "../restaurant/shared-dashboard-legibility.css";
const items=[["/admin","نظرة عامة"],["/admin/tenants","المتاجر"]];
const groups=[["التشغيل",[["/admin/international-shipping","موافقات الشحن الدولي"],["/admin/plans","الباقات والمميزات"],["/admin/subscriptions","الاشتراكات"],["/admin/billing","المدفوعات والفواتير"],["/admin/users","المستخدمون والصلاحيات"]]],["التواصل",[["/admin/notifications","الإشعارات والرسائل"],["/admin/translations","الترجمات"]]],["المنصة",[["/admin/pages","صفحات الموقع"],["/admin/settings","إعدادات المنصة"],["/admin/audit","سجل العمليات"]]]] as const;
const translations:Record<string,{en:string;fr:string}>={"نظرة عامة":{en:"Overview",fr:"Vue d’ensemble"},"المتاجر":{en:"Stores",fr:"Boutiques"},"موافقات الشحن الدولي":{en:"International shipping approvals",fr:"Approbations des livraisons internationales"},"التشغيل":{en:"Operations",fr:"Opérations"},"الباقات والمميزات":{en:"Plans and features",fr:"Offres et fonctionnalités"},"الاشتراكات":{en:"Subscriptions",fr:"Abonnements"},"المدفوعات والفواتير":{en:"Payments and invoices",fr:"Paiements et factures"},"المستخدمون والصلاحيات":{en:"Users and permissions",fr:"Utilisateurs et autorisations"},"التواصل":{en:"Communication",fr:"Communication"},"الإشعارات والرسائل":{en:"Notifications and messages",fr:"Notifications et messages"},"الترجمات":{en:"Translations",fr:"Traductions"},"المنصة":{en:"Platform",fr:"Plateforme"},"صفحات الموقع":{en:"Website pages",fr:"Pages du site"},"إعدادات المنصة":{en:"Platform settings",fr:"Paramètres de la plateforme"},"سجل العمليات":{en:"Audit log",fr:"Journal d’audit"},"إغلاق قائمة الإدارة":{en:"Close admin menu",fr:"Fermer le menu d’administration"},"فتح قائمة الإدارة":{en:"Open admin menu",fr:"Ouvrir le menu d’administration"},"إغلاق القائمة":{en:"Close menu",fr:"Fermer le menu"},"لوحة المنصة":{en:"Platform dashboard",fr:"Tableau de bord de la plateforme"},"مساحة إدارة FOON":{en:"FOON administration workspace",fr:"Espace d’administration FOON"},"تفعيل الوضع الليلي":{en:"Enable dark mode",fr:"Activer le mode sombre"},"تفعيل الوضع النهاري":{en:"Enable light mode",fr:"Activer le mode clair"},"فتح قسم الإشعارات والرسائل":{en:"Open notifications and messages",fr:"Ouvrir les notifications et messages"},"تسجيل الخروج":{en:"Sign out",fr:"Se déconnecter"}};
export default function AdminLayout({children}:{children:React.ReactNode}){
 const [open,setOpen]=useState(false);
 const language=useUiLanguage();

 const t=(ar:string)=>language==="ar"?ar:translations[ar]?.[language]??ar;
 const {mode,resolved,setMode}=useWorkspaceTheme();
 useEffect(()=>{
  try{
   if(window.localStorage.getItem("foon-workspace-theme")!==null)return;
   const previous=window.localStorage.getItem("foon-admin-theme");
   if(previous==="light"||previous==="dark")setMode(previous);
  }catch{/* Private browsing still supports the in-memory UI choice. */}
 },[setMode]);
 const pathname=usePathname();
 const active=(href:string)=>href==="/admin"?pathname==="/admin":pathname.startsWith(href);
 return <div className="adminShell" dir={language==="ar"?"rtl":"ltr"} data-theme={resolved} data-theme-preference={mode}><aside className="adminSide"><div className="adminBrandRow"><Link href="/admin" className="adminLogo">FOON<small>Platform Admin</small></Link><div className={"adminMobileMenu"+(open?" isOpen":"")}><button type="button" className="adminMenuButton" aria-label={t(open?"إغلاق قائمة الإدارة":"فتح قائمة الإدارة")} aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span aria-hidden="true">{open?"×":"☰"}</span></button>{open&&<><button type="button" className="adminMenuBackdrop" aria-label={t("إغلاق القائمة")} onClick={()=>setOpen(false)}/><div className="adminDrawer">{items.map(([href,label])=><Link key={href} href={href} className={active(href)?"active":undefined} onClick={()=>setOpen(false)}>{t(label)}</Link>)}{groups.map(([group,links])=><div className="adminDrawerGroup" key={group}><small>{t(group)}</small>{links.map(([href,label])=><Link key={href} href={href} className={active(href)?"active":undefined} onClick={()=>setOpen(false)}>{t(label)}</Link>)}</div>)}</div></>}</div></div><nav>{items.map(([href,label])=><Link key={href} href={href} className={active(href)?"active":undefined}>{t(label)}</Link>)}{groups.map(([group,links])=><div className="adminNavGroup" key={group}><small>{t(group)}</small>{links.map(([href,label])=><Link key={href} href={href} className={active(href)?"active":undefined}>{t(label)}</Link>)}</div>)}</nav></aside><section className="adminStage"><header className="adminTop"><div><b>{t("لوحة المنصة")}</b><small>{t("مساحة إدارة FOON")}</small></div><div className="adminTopActions"><AccountLanguageSwitcher/><WorkspaceThemeControl language={language} className="adminWorkspaceTheme"/><Link href="/admin/notifications" className="adminIconButton adminNotificationButton" aria-label={t("فتح قسم الإشعارات والرسائل")}>♢</Link><form action="/api/auth/logout" method="post"><button>{t("تسجيل الخروج")}</button></form></div></header><TranslationLeakMonitor/>{children}</section></div>
}
