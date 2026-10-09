"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {supportedCountries} from "@/lib/tenant/country-catalog";
export default function CountryPicker({selected}:{selected:string}){
 const router=useRouter(),[search,setSearch]=useState(""),[country,setCountry]=useState(selected);
 const [source,setSource]=useState(selected);
 if(source!==selected){setSource(selected);setCountry(selected);}
 const filtered=supportedCountries.filter(c=>(c.ar+" "+c.en+" "+c.code).toLowerCase().includes(search.toLowerCase())).slice(0,54);
 function change(value:string){setCountry(value);document.cookie="foon-market-country="+encodeURIComponent(value)+"; path=/; max-age=31536000; samesite=lax";const url=new URL(window.location.href);url.searchParams.set("country",value);router.push(url.pathname+url.search)}
 return <div className="foonCountryPicker"><label htmlFor="market-country">الدولة المعروضة في السوق</label><select id="market-country" value={country} onChange={e=>change(e.target.value)}>{supportedCountries.map(c=><option key={c.code} value={c.code}>{c.ar} · {c.code}</option>)}</select><details><summary>البحث في قائمة الدول</summary><input aria-label="ابحث عن دولة" value={search} onChange={e=>setSearch(e.target.value)} placeholder="اسم الدولة أو رمزها"/><div className="foonCountryChoices">{filtered.map(c=><button key={c.code} type="button" onClick={()=>change(c.code)}>{c.ar} ({c.code})</button>)}</div></details></div>
}
