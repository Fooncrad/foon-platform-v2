"use client";
import {useLanguagePreference} from "@/lib/i18n/ui-language";
import type {ChangeEvent} from "react";
import type {UiLanguage} from "@/lib/i18n/ui-copy";

const choices:readonly {code:UiLanguage;name:string}[]=[{code:"ar",name:"العربية"},{code:"en",name:"English"},{code:"fr",name:"Français"}];
export default function LanguageSelector({className,selectClassName,style}:{className?:string;selectClassName?:string;style?:React.CSSProperties}){
 const [language,setLanguage]=useLanguagePreference();
 const change=(event:ChangeEvent<HTMLSelectElement>)=>setLanguage(event.target.value as UiLanguage);
 return <label className={className} style={style}><span className="sr-only">اللغة / Language / Langue</span><select className={selectClassName} aria-label="اللغة / Language / Langue" value={language} onChange={change} style={{minWidth:96,maxWidth:125,border:"1px solid var(--border,#d9e2ee)",borderRadius:10,padding:"8px 6px",background:"var(--surface,#fff)",color:"var(--text,#172033)",font:"inherit"}}>{choices.map(option=><option key={option.code} value={option.code}>{option.name}</option>)}</select></label>;
}
