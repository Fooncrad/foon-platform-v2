"use client";
import {useEffect,useState} from "react";
import {isActivityType,type ActivityLanguage} from "@/lib/platform/activity-presets";
import {activityToolLinks} from "@/lib/platform/activity-tool-links";
export default function ActivityTools({tenantId,activity,language}:{tenantId:string;activity:string;language?:ActivityLanguage}){
 const [local,setLocal]=useState<ActivityLanguage>("ar"),lang=language??local;
 const t=(ar:string,en:string,fr:string)=>lang==="ar"?ar:lang==="en"?en:fr;
 useEffect(()=>{const update=()=>{const value=localStorage.getItem("foon-language");setLocal(value==="en"||value==="fr"?value:document.documentElement.lang==="en"||document.documentElement.lang==="fr"?document.documentElement.lang:"ar");};queueMicrotask(update);window.addEventListener("foon:language-change",update);return()=>window.removeEventListener("foon:language-change",update);},[]);
 const links=isActivityType(activity)?activityToolLinks(activity,tenantId,lang):[];
 if(!isActivityType(activity))return <section role="alert" dir={lang==="ar"?"rtl":"ltr"} className="foonActivityTools"><p>{t("نوع النشاط غير معروف. راجع إعدادات نشاطك.","Unknown business activity. Review your business settings.","Type d’activité inconnu. Vérifiez les paramètres de votre activité.")}</p></section>;
 return <section dir={lang==="ar"?"rtl":"ltr"} className="foonActivityTools" style={{marginBlock:24}}>
  <h2>{t("أدوات النشاط","Business tools","Outils de l’activité")}</h2><p>{t("افتح أداة النشاط المطلوبة من مكان واحد. تظل صلاحيات الحساب والباقة مطبقة داخل كل أداة.","Open your business tools from one place. Account and plan permissions apply inside each tool.","Accédez aux outils depuis un seul endroit. Les autorisations du compte et de l’abonnement restent appliquées.")}</p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))",gap:12}}>
   {links.map(link=><a key={link.href} href={link.href} data-tools={link.codes.join(",")} style={{padding:16,border:"1px solid var(--border,#d9e2ee)",borderRadius:12,color:"inherit",textDecoration:"none",background:"var(--surface,#fff)",overflowWrap:"anywhere"}}>{link.label} ↗</a>)}
  </div>
 </section>;
}


