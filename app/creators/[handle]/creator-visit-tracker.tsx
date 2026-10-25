"use client";
import {useEffect} from "react";
export default function CreatorVisitTracker({handle}:{handle:string}){
 useEffect(()=>{
  if(!handle)return;
  const controller=new AbortController();
  void fetch("/api/public/visits",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"profile",id:handle}),signal:controller.signal,cache:"no-store"}).catch(()=>{});
  return()=>controller.abort();
 },[handle]);
 return null;
}
