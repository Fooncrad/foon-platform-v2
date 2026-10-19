"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";

/** Remove legacy tenant IDs from a verified merchant subpage URL. */
export default function CanonicalTenantUrl({tenantId}:{tenantId:string}){
 const router=useRouter();
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
    router.replace(url.pathname+url.search+url.hash);
    router.refresh();
   }catch{/* Keep a usable legacy link if session persistence fails. */}
  };
  void normalize();
  return()=>{cancelled=true;};
 },[tenantId,router]);
 return null;
}
