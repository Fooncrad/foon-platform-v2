"use client";
import {useLanguagePreference} from "@/lib/i18n/ui-language";
const labels={ar:"العربية",en:"English",fr:"Français"} as const;
export default function AccountLanguageSwitcher(){
 const [language,change]=useLanguagePreference();
 return <label className="restaurantLanguageSelector" style={{display:"inline-flex",alignItems:"center",gap:6}}><span className="sr-only">اللغة / Language / Langue</span><select aria-label="اللغة / Language / Langue" value={language} onChange={event=>change(event.target.value as keyof typeof labels)} style={{minWidth:96,maxWidth:125,border:"1px solid #d9e2ee",borderRadius:10,padding:"8px 6px",background:"var(--surface,#fff)",color:"var(--text,#172033)",font:"inherit"}}>{(Object.keys(labels) as (keyof typeof labels)[]).map(key=><option key={key} value={key}>{labels[key]}</option>)}</select></label>;
}
