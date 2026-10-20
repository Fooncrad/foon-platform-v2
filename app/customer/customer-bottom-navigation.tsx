"use client";
import {useEffect,useState} from "react";
import {customerNavigation,currentCustomerSection,type CustomerNavLanguage} from "@/lib/ux/customer-navigation";
export default function CustomerBottomNavigation({language}:{language:CustomerNavLanguage}){
 const [active,setActive]=useState("customer-top");
 useEffect(()=>{
  const sync=()=>setActive(currentCustomerSection(window.location.hash));
  sync();
  window.addEventListener("hashchange",sync);
  return()=>window.removeEventListener("hashchange",sync);
 },[]);
 const label=language==="ar"?"التنقل الأساسي لحساب العميل":language==="fr"?"Navigation du compte client":"Customer account navigation";
 return <nav className="customerMobileNavigation" aria-label={label}>
  {customerNavigation(language).map(item=><a href={item.href} key={item.id} aria-current={active===item.id?"location":undefined}><span aria-hidden="true" className="customerMobileNavIcon">{item.icon}</span><span className="customerMobileNavLabel">{item.label}</span></a>)}
 </nav>;
}
