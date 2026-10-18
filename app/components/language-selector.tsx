"use client";
import {useLanguagePreference} from "@/lib/i18n/ui-language";
import type {ChangeEvent} from "react";
import type {UiLanguage} from "@/lib/i18n/ui-copy";

const choices:readonly {code:UiLanguage;name:string}[]=[{code:"ar",name:"العربية"},{code:"en",name:"English"},{code:"fr",name:"Français"}];
export default function LanguageSelector({className,selectClassName}:{className?:string;selectClassName?:string}){
 const [language,setLanguage]=useLanguagePreference();
 const change=(event:ChangeEvent<HTMLSelectElement>)=>setLanguage(event.target.value as UiLanguage);
 return <label className={`foonLanguageSelector${className?` ${className}`:""}`}><span className="sr-only">اللغة / Language / Langue</span><select className={selectClassName} aria-label="اللغة / Language / Langue" value={language} onChange={change}>{choices.map(option=><option key={option.code} value={option.code}>{option.name}</option>)}</select></label>;
}
