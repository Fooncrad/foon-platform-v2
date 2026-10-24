"use client";
import {useEffect} from "react";
export default function CreatorVisitTracker({handle}:{handle:string}){
 useEffect(()=>{
  if(!handle)return;
  void fetch("/api/public/visits",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"profile",id:handle}),keepalive:true}).catch(()=>{});
 },[handle]);
 return null;
}
