"use client";
import {setUiLanguage} from "@/lib/i18n/ui-language";
import {useRouter} from "next/navigation";
import type {ActivityLanguage} from "@/lib/platform/activity-presets";
const labels:Record<ActivityLanguage,string>={ar:"العربية",en:"English",fr:"Français"};
export default function StorefrontLanguageSwitcher({language}:{language:ActivityLanguage}){
 const router=useRouter();
 function change(next:ActivityLanguage){
  setUiLanguage(next);
  router.refresh();
 }
 return <label className="foonLanguageSelector foonActivityLanguageSelector">
  <span className="sr-only">اللغة / Language / Langue</span>
  <select aria-label="اللغة / Language / Langue" value={language} onChange={e=>change(e.target.value as ActivityLanguage)}>
   {(Object.keys(labels) as ActivityLanguage[]).map(key=><option key={key} value={key}>{labels[key]}</option>)}
  </select>
 </label>;
}
