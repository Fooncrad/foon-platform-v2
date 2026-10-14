"use client";
import {useRouter} from "next/navigation";
import type {ActivityLanguage} from "@/lib/platform/activity-presets";
const labels:Record<ActivityLanguage,string>={ar:"العربية",en:"English",fr:"Français"};
export default function StorefrontLanguageSwitcher({language}:{language:ActivityLanguage}){
 const router=useRouter();
 function change(next:ActivityLanguage){
  document.cookie="foon_language="+next+"; Path=/; Max-Age=31536000; SameSite=Lax";
  try{localStorage.setItem("foon-language",next);}catch{}
  document.documentElement.lang=next;
  document.documentElement.dir=next==="ar"?"rtl":"ltr";
  router.refresh();
 }
 return <label style={{display:"inline-flex",alignItems:"center",gap:6}}>
  <span className="sr-only">اللغة / Language / Langue</span>
  <select aria-label="اللغة / Language / Langue" value={language} onChange={e=>change(e.target.value as ActivityLanguage)} style={{border:"1px solid #cbd5e1",borderRadius:8,padding:"8px",minHeight:40,background:"white",color:"#172033"}}>
   {(Object.keys(labels) as ActivityLanguage[]).map(key=><option key={key} value={key}>{labels[key]}</option>)}
  </select>
 </label>;
}
