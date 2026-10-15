"use client";
import {useEffect,useState} from "react";
import {isActivityType,localizedActivityModules,type ActivityLanguage} from "@/lib/platform/activity-presets";
const destinations:Record<string,string>={serviceOrders:"serviceOrders",orders:"orders",pos:"pos",tables:"tables",reservations:"reservations",waitlist:"reservations",kitchen:"kds",waiter:"tables",inventory:"inventory",barcode:"inventory",suppliers:"inventory",delivery:"orders",pickup:"orders",variants:"menu",bookings:"reservations",quotes:"quotes",staff:"team",invoices:"printers",reports:"reports",branches:"branches",customers:"customers",marketing:"marketing",security:"security"};
export default function ActivityTools({tenantId,activity,language}:{tenantId:string;activity:string;language?:ActivityLanguage}){
 const [local,setLocal]=useState<ActivityLanguage>("ar"),lang=language??local;
 const t=(ar:string,en:string,fr:string)=>lang==="ar"?ar:lang==="en"?en:fr;
 useEffect(()=>{const update=()=>{const value=localStorage.getItem("foon-language");setLocal(value==="en"||value==="fr"?value:"ar");};queueMicrotask(update);window.addEventListener("foon:language-change",update);return()=>window.removeEventListener("foon:language-change",update);},[]);
 const modules=isActivityType(activity)?localizedActivityModules(activity,lang):[],tenant=encodeURIComponent(tenantId);
 const shared:Record<string,[string,string,string]>={staff:["الموظفون والصلاحيات","Staff and permissions","Équipe et autorisations"],invoices:["الطابعات والفواتير","Printers and invoices","Imprimantes et factures"],reports:["التقارير","Reports","Rapports"],branches:["الفروع والإعدادات","Branches and settings","Succursales et paramètres"],customers:["العملاء","Customers","Clients"],marketing:["التسويق","Marketing","Marketing"],mediaStudio:["إدارة الميديا","Media Studio","Studio média"],security:["أمان الحساب","Account security","Sécurité du compte"]};
 if(modules.some(item=>item.code==="services"))modules.push({code:"serviceOrders",label:t("أوامر الخدمة","Service orders","Ordres de service")});
 for(const [code,labels] of Object.entries(shared))if(!modules.some(item=>item.code===code))modules.push({code,label:t(...labels)});
 if(!isActivityType(activity))return <section role="alert" dir={lang==="ar"?"rtl":"ltr"} className="foonActivityTools"><p>{t("نوع النشاط غير معروف. راجع إعدادات نشاطك.","Unknown business activity. Review your business settings.","Type d’activité inconnu. Vérifiez les paramètres de votre activité.")}</p></section>;
 return <section dir={lang==="ar"?"rtl":"ltr"} className="foonActivityTools" style={{marginBlock:24}}>
  <h2>{t("أدوات النشاط","Business tools","Outils de l’activité")}</h2><p>{t("افتح أداة النشاط المطلوبة من مكان واحد. تظل صلاحيات الحساب والباقة مطبقة داخل كل أداة.","Open your business tools from one place. Account and plan permissions apply inside each tool.","Accédez aux outils depuis un seul endroit. Les autorisations du compte et de l’abonnement restent appliquées.")}</p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))",gap:12}}>
   {modules.map(module=>{
    const href=module.code==="mediaStudio"?"/restaurant/media-studio?tenant="+tenant:module.code==="payments"?"/restaurant/payments?tenant="+tenant:module.code==="catalog"||module.code==="services"?"/restaurant/activity-setup?tenant="+tenant+"#catalog":destinations[module.code]?"/restaurant?tenant="+tenant+"&section="+destinations[module.code]:null;
    return href?<a key={module.code} href={href} style={{padding:16,border:"1px solid var(--border,#d9e2ee)",borderRadius:12,color:"inherit",textDecoration:"none",background:"var(--surface,#fff)",overflowWrap:"anywhere"}}>{module.label} ↗</a>:<div key={module.code} style={{padding:16,border:"1px solid var(--border,#d9e2ee)",borderRadius:12}}>{module.label}<small style={{display:"block",marginTop:8}}>{t("قيد إكمال الربط","Integration pending","Intégration en attente")}</small></div>;
   })}
  </div>
 </section>;
}

