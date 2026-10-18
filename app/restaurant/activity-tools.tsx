"use client";
import {useUiText} from "@/lib/i18n/ui-language";
import {useEffect,useState} from "react";
import {isActivityType,localizedActivityModules,type ActivityLanguage} from "@/lib/platform/activity-presets";
import {activityWorkspaceUrl,activityPaymentsUrl,activityMediaStudioUrl} from "@/lib/tenant/workspace-routes";
const destinations:Record<string,string>={serviceOrders:"serviceOrders",orders:"orders",pos:"pos",tables:"tables",reservations:"reservations",waitlist:"reservations",kitchen:"kds",waiter:"tables",inventory:"inventory",barcode:"inventory",suppliers:"inventory",delivery:"orders",pickup:"pickupPoints",variants:"menu",bookings:"serviceOrders",quotes:"quotes",staff:"team",invoices:"printers",reports:"reports",branches:"branches",customers:"customers",marketing:"marketing",security:"security"};
export default function ActivityTools({tenantId,activity,language}:{tenantId:string;activity:string;language?:ActivityLanguage}){
 const translateUi=useUiText();

 const [local,setLocal]=useState<ActivityLanguage>("ar"),lang=language??local;
 const t=(ar:string,en:string,fr:string)=>lang==="ar"?ar:lang==="en"?en:fr;
 useEffect(()=>{const update=()=>{const value=localStorage.getItem("foon-language");setLocal(value==="en"||value==="fr"?value:document.documentElement.lang==="en"||document.documentElement.lang==="fr"?document.documentElement.lang:"ar");};queueMicrotask(update);window.addEventListener("foon:language-change",update);return()=>window.removeEventListener("foon:language-change",update);},[]);
 const modules=isActivityType(activity)?localizedActivityModules(activity,lang):[];
 const shared:Record<string,[string,string,string]>={staff:[translateUi("الموظفون والصلاحيات"),"Staff and permissions","Équipe et autorisations"],invoices:[translateUi("الطابعات والفواتير"),"Printers and invoices","Imprimantes et factures"],reports:[translateUi("التقارير"),"Reports","Rapports"],branches:[translateUi("الفروع والإعدادات"),"Branches and settings","Succursales et paramètres"],customers:[translateUi("العملاء"),"Customers","Clients"],marketing:[translateUi("التسويق"),"Marketing","Marketing"],mediaStudio:[translateUi("إدارة الميديا"),"Media Studio","Studio média"],security:[translateUi("أمان الحساب"),"Account security","Sécurité du compte"]};
 if(modules.some(item=>item.code==="services"))modules.push({code:"serviceOrders",label:t("أوامر الخدمة","Service orders","Ordres de service")});
 for(const [code,labels] of Object.entries(shared))if(!modules.some(item=>item.code===code))modules.push({code,label:t(...labels)});
 if(!isActivityType(activity))return <section role="alert" dir={lang==="ar"?"rtl":"ltr"} className="foonActivityTools"><p>{t("نوع النشاط غير معروف. راجع إعدادات نشاطك.","Unknown business activity. Review your business settings.","Type d’activité inconnu. Vérifiez les paramètres de votre activité.")}</p></section>;
 const base=activityWorkspaceUrl(activity,tenantId);
 const linkFor=(module:{code:string})=>module.code==="mediaStudio"?activityMediaStudioUrl(activity,tenantId):module.code==="payments"?activityPaymentsUrl(activity,tenantId):module.code==="catalog"||module.code==="services"?base+"&section=menu":destinations[module.code]?base+"&section="+destinations[module.code]:null;
 const seen=new Set<string>();
 return <section dir={lang==="ar"?"rtl":"ltr"} className="foonActivityTools" style={{marginBlock:24}}>
  <h2>{t("أدوات النشاط","Business tools","Outils de l’activité")}</h2><p>{t("افتح أداة النشاط المطلوبة من مكان واحد. تظل صلاحيات الحساب والباقة مطبقة داخل كل أداة.","Open your business tools from one place. Account and plan permissions apply inside each tool.","Accédez aux outils depuis un seul endroit. Les autorisations du compte et de l’abonnement restent appliquées.")}</p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))",gap:12}}>
   {modules.map(module=>{
    const href=linkFor(module);if(href&&seen.has(href))return null;if(href)seen.add(href);
    const label=href?modules.filter(item=>linkFor(item)===href).map(item=>item.label).join(" · "):module.label;
    return href?<a key={module.code} href={href} style={{padding:16,border:"1px solid var(--border,#d9e2ee)",borderRadius:12,color:"inherit",textDecoration:"none",background:"var(--surface,#fff)",overflowWrap:"anywhere"}}>{label} ↗</a>:<div key={module.code} style={{padding:16,border:"1px solid var(--border,#d9e2ee)",borderRadius:12}}>{module.label}<small style={{display:"block",marginTop:8}}>{t("قيد إكمال الربط","Integration pending","Intégration en attente")}</small></div>;
   })}
  </div>
 </section>;
}


