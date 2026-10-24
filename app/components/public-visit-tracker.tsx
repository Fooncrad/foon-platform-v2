"use client";
import {useEffect} from "react";

type Target={kind:"storefront";slug:string}|{kind:"profile";userId:string}|{kind:"product";slug:string;id:string;source:"restaurant"|"catalog"};
const sent=new Set<string>();
export function recordPublicVisit(target:Target){
 if(typeof window==="undefined"||navigator.webdriver)return;
 const params=new URLSearchParams(window.location.search);
 if(params.has("previewTemplate")||params.has("preview"))return;
 const key=JSON.stringify(target);
 if(sent.has(key))return;
 sent.add(key);
 const body=target.kind==="storefront"?{kind:"storefront",id:target.slug}:
  target.kind==="profile"?{kind:"profile",id:target.userId}:
  {kind:"product",id:target.slug,productId:target.id,source:target.source};
 void fetch("/api/public/visits",{
  method:"POST",
  headers:{"content-type":"application/json"},
  credentials:"same-origin",
  keepalive:true,
  body:JSON.stringify(body)
 }).then(response=>{if(!response.ok)sent.delete(key)}).catch(()=>sent.delete(key));
}
export default function PublicVisitTracker({kind,slug,userId}:{kind:"storefront"|"profile";slug?:string;userId?:string}){
 useEffect(()=>{
  if(kind==="storefront"&&slug)recordPublicVisit({kind,slug});
  if(kind==="profile"&&userId)recordPublicVisit({kind,userId});
 },[kind,slug,userId]);
 return null;
}
export function recordProductDetailsVisit(source:"restaurant"|"catalog",slug:string,id:string){
 recordPublicVisit({kind:"product",slug,id,source});
}
