"use client";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {supportedCountries} from "@/lib/tenant/country-catalog";
const preferred=["SA","AE","KW","QA","BH","OM","EG","MA"] as const;
export default function CountryPicker({selected}:{selected:string}){
 const lang=useUiLanguage();
 const router=useRouter();
 const [search,setSearch]=useState("");
 const [expanded,setExpanded]=useState(false);
 const [country,setCountry]=useState(selected);
 const [source,setSource]=useState(selected);
 if(source!==selected){setSource(selected);setCountry(selected);}
 const copy={ar:{label:"الدولة المعروضة في السوق",select:"اختر الدولة",search:"ابحث عن دولة أو رمزها",more:"عرض جميع الدول",less:"إخفاء بقية الدول",top:"دول مقترحة",none:"لا توجد دولة مطابقة"},en:{label:"Marketplace country",select:"Choose a country",search:"Search country or code",more:"All countries",less:"Hide other countries",top:"Suggested countries",none:"No matching countries"},fr:{label:"Pays du marché",select:"Choisir un pays",search:"Rechercher un pays ou un code",more:"Tous les pays",less:"Masquer les autres pays",top:"Pays suggérés",none:"Aucun pays trouvé"}}[lang];
 const match=(c:typeof supportedCountries[number])=>(c.ar+" "+c.en+" "+c.fr+" "+c.code).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
 const top=supportedCountries.filter(c=>preferred.some(code=>code===c.code));
 const rest=supportedCountries.filter(c=>!preferred.some(code=>code===c.code));
 const list=search.trim()?supportedCountries.filter(match):rest;
 function change(value:string){setCountry(value);document.cookie="foon-market-country="+encodeURIComponent(value)+"; path=/; max-age=31536000; samesite=lax";const url=new URL(window.location.href);if(value)url.searchParams.set("country",value);else url.searchParams.delete("country");url.searchParams.delete("page");router.push(url.pathname+url.search);}
 return <div className="foonCountryPicker" dir={lang==="ar"?"rtl":"ltr"}>
 <label htmlFor="market-country">{copy.label}</label>
 <select id="market-country" value={country} onChange={e=>change(e.target.value)}>
 <option value="">{copy.select}</option>
 {top.map(c=><option key={c.code} value={c.code}>{c[lang]} · {c.code}</option>)}
 {!top.some(c=>c.code===country)&&country&&<option value={country}>{supportedCountries.find(c=>c.code===country)?.[lang]??country}</option>}
 </select>
 <button className="foonCountryMore" type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?copy.less:copy.more}</button>
 {expanded&&<div className="foonCountryExpanded">
 <label htmlFor="market-country-search">{copy.search}</label>
 <input id="market-country-search" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={copy.search}/>
 <div className="foonCountryChoices">{list.length?list.map(c=><button key={c.code} type="button" aria-pressed={country===c.code} onClick={()=>change(c.code)}>{c[lang]} ({c.code})</button>):<p>{copy.none}</p>}</div>
 </div>}
 </div>;
}
