"use client";
import {useState} from "react";
import {supportedCountries} from "@/lib/tenant/country-catalog";
export default function CountrySelect({value,onChange,language}:{value:string;onChange:(code:string)=>void;language:"ar"|"en"|"fr"}){
 const [open,setOpen]=useState(false),[search,setSearch]=useState("");
 const current=supportedCountries.find(c=>c.code===value);
 const results=supportedCountries.filter(c=>(c.ar+" "+c.en+" "+c.fr+" "+c.code).toLowerCase().includes(search.toLowerCase()));
 return <div className="foonCompactCountry"><button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{current?.[language]??value} · {value} <span aria-hidden="true">⌄</span></button>{open&&<div className="foonCountryDropdown"><input aria-label={language==="ar"?"ابحث عن دولة":"Search country"} value={search} onChange={e=>setSearch(e.target.value)} placeholder={language==="ar"?"ابحث باسم الدولة":"Search country"} autoFocus/><div role="listbox" aria-label={language==="ar"?"الدول":"Countries"}>{results.map(c=><button type="button" role="option" aria-selected={value===c.code} key={c.code} onClick={()=>{onChange(c.code);setOpen(false);setSearch("")}}>{c[language]} · {c.code}</button>)}</div></div>}</div>
}
