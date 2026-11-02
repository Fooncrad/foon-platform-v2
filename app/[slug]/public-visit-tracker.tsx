"use client";
import {useEffect} from "react";
export default function PublicVisitTracker({slug}:{slug:string}){
 useEffect(()=>{
  if(!slug)return;
  void fetch("/api/public/visits",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"storefront",id:slug}),keepalive:true}).catch(()=>{});
 },[slug]);
 return null;
}
