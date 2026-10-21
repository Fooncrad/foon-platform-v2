"use client";
import {useEffect,useState} from "react";
import {isActivityType,type ActivityLanguage} from "@/lib/platform/activity-presets";
import {activityToolLinks} from "@/lib/platform/activity-tool-links";
import {MerchantIcon} from "./merchant-icon";
const TOOL_ICONS:Record<string,string>={catalog:"menu",services:"menu",serviceOrders:"clock",orders:"bag",pos:"wallet",tables:"table",reservations:"calendar",waitlist:"calendar",kitchen:"chef",waiter:"table",inventory:"box",barcode:"box",suppliers:"box",delivery:"bag",pickup:"store",room_service:"store",variants:"box",bookings:"calendar",quotes:"wallet",staff:"users",invoices:"wallet",reports:"trend",branches:"store",customers:"users",marketing:"trend",mediaStudio:"menu",mediaLibrary:"menu",security:"shield",payments:"wallet"};
export default function ActivityTools({tenantId,activity,language,personalMediaAllowed=true,appearance="light"}:{tenantId:string;activity:string;language?:ActivityLanguage;personalMediaAllowed?:boolean;appearance?:"light"|"dark"}){
 const [local,setLocal]=useState<ActivityLanguage>("ar"),lang=language??local;
 const t=(ar:string,en:string,fr:string)=>lang==="ar"?ar:lang==="en"?en:fr;
 useEffect(()=>{const update=()=>{const value=localStorage.getItem("foon-language");setLocal(value==="en"||value==="fr"?value:document.documentElement.lang==="en"||document.documentElement.lang==="fr"?document.documentElement.lang:"ar");};queueMicrotask(update);window.addEventListener("foon:language-change",update);return()=>window.removeEventListener("foon:language-change",update);},[]);
 const links=isActivityType(activity)?activityToolLinks(activity,tenantId,lang):[];
 const visibleLinks=personalMediaAllowed?links:links.filter(link=>!link.codes.includes("mediaLibrary"));
 if(!isActivityType(activity))return <section role="alert" dir={lang==="ar"?"rtl":"ltr"} className="foonActivityTools"><p>{t("نوع النشاط غير معروف. راجع إعدادات نشاطك.","Unknown business activity. Review your business settings.","Type d’activité inconnu. Vérifiez les paramètres de votre activité.")}</p></section>;
 return <section dir={lang==="ar"?"rtl":"ltr"} className="foonActivityTools">
  <h2>{t("أدوات النشاط","Business tools","Outils de l’activité")}</h2><p>{t("افتح أداة النشاط المطلوبة من مكان واحد. تظل صلاحيات الحساب والباقة مطبقة داخل كل أداة.","Open your business tools from one place. Account and plan permissions apply inside each tool.","Accédez aux outils depuis un seul endroit. Les autorisations du compte et de l’abonnement restent appliquées.")}</p>
  <div className="foonActivityToolsGrid">
   {visibleLinks.map(link=><a className="foonActivityToolLink" key={link.href} href={link.href} data-tools={link.codes.join(",")} style={{backgroundColor:appearance==="dark"?"#242832":"#ffffff",color:appearance==="dark"?"#f8f3e9":"#182230",borderColor:appearance==="dark"?"#424c5b":"#e7e8ef"}}><span className="foonActivityToolIcon" aria-hidden="true"><MerchantIcon name={TOOL_ICONS[link.codes[0]]??"dashboard"}/></span><span className="foonActivityToolLabel">{link.label}</span><span className="foonActivityToolArrow" aria-hidden="true">↗</span></a>)}
  </div>
 </section>;
}


