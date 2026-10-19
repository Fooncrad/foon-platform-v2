"use client";
import {useEffect} from "react";

/** Remove legacy tenant IDs from a verified merchant subpage URL. */
export default function CanonicalTenantUrl({tenantId}:{tenantId:string}){
 useEffect(()=>{
  const url=new URL(window.location.href);
  const legacyTenant=url.searchParams.get("tenant");
  if(!legacyTenant||legacyTenant!==tenantId)return;
  let cancelled=false;
  const normalize=async()=>{
   try{
    const response=await fetch("/api/tenant/active",{
     method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({tenantId})
    });
    if(!response.ok||cancelled)return;
    url.searchParams.delete("tenant");
    // The tenant is already validated on this server-rendered page.
    window.history.replaceState(null,"",url.pathname+url.search+url.hash);
   }catch{/* Keep a usable legacy link if session persistence fails. */}
  };
  void normalize();
  return()=>{cancelled=true;};
 },[tenantId]);
 return null;
}
