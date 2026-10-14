"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
type Language="ar"|"en"|"fr";
const labels:Record<Language,string>={ar:"العربية",en:"English",fr:"Français"};
const storageKey="foon-language";
function currentLanguage():Language{
 if(typeof document==="undefined")return "ar";
 const value=document.documentElement.lang.toLowerCase().slice(0,2);
 return value==="en"||value==="fr"?value:"ar";
}
export default function AccountLanguageSwitcher(){
 const router=useRouter();
 const [language,setLanguage]=useState<Language>("ar");
 useEffect(()=>{
  const saved=window.localStorage.getItem(storageKey);
  const next:Language=saved==="en"||saved==="fr"||saved==="ar"?saved:currentLanguage();
  queueMicrotask(()=>setLanguage(next));
  document.documentElement.lang=next;
  document.documentElement.dir=next==="ar"?"rtl":"ltr";
 },[]);
 function change(next:Language){
  setLanguage(next);
  window.localStorage.setItem(storageKey,next);
  document.cookie="foon_language="+next+"; Path=/; Max-Age=31536000; SameSite=Lax";
  document.documentElement.lang=next;
  document.documentElement.dir=next==="ar"?"rtl":"ltr";
  window.dispatchEvent(new CustomEvent("foon:language-change",{detail:{language:next}}));
  router.refresh();
 }
 return <label className="restaurantLanguageSelector" style={{display:"inline-flex",alignItems:"center",gap:6}}>
  <span className="sr-only">اللغة / Language / Langue</span>
  <select aria-label="اللغة / Language / Langue" value={language} onChange={event=>change(event.target.value as Language)} style={{minWidth:96,maxWidth:125,border:"1px solid #d9e2ee",borderRadius:10,padding:"8px 6px",background:"var(--surface,#fff)",color:"var(--text,#172033)",font:"inherit"}}>
   {(Object.keys(labels) as Language[]).map(key=><option key={key} value={key}>{labels[key]}</option>)}
  </select>
 </label>;
}
