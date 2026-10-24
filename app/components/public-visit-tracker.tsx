"use client";
import {useEffect} from "react";
import type {PublicVisitKind} from "@/lib/analytics/public-visits";

type VisitTarget={kind:"storefront";slug:string}|{kind:"creator_profile";handle:string}|{kind:"restaurant_item"|"catalog_product";slug:string;id:string};
const sent=new Set<string>();
export function recordPublicVisit(target:VisitTarget){
 if(typeof window==="undefined"||navigator.webdriver)return;
 // Preview and administration must not inflate public counters.
 if(new URLSearchParams(window.location.search).has("previewTemplate"))return;
 const key=JSON.stringify(target);
 if(sent.has(key))return;
 sent.add(key);
 void fetch("/api/analytics/visit",{
  method:"POST",
  headers:{"content-type":"application/json"},
  credentials:"same-origin",
  keepalive:true,
  body:key
 }).then(response=>{if(!response.ok)sent.delete(key)}).catch(()=>sent.delete(key));
}
export default function PublicVisitTracker({kind,slug,handle}:{kind:"storefront"|"creator_profile";slug?:string;handle?:string}){
 useEffect(()=>{
  if(kind==="storefront"&&slug)recordPublicVisit({kind,slug});
  if(kind==="creator_profile"&&handle)recordPublicVisit({kind,handle});
 },[kind,slug,handle]);
 return null;
}
export function recordProductDetailsVisit(kind:Extract<PublicVisitKind,"restaurant_item"|"catalog_product">,slug:string,id:string){
 recordPublicVisit({kind,slug,id});
}
