"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";

export default function OrderLiveRefresh(){
 const router=useRouter();
 useEffect(()=>{
  let active=true;
  const refresh=()=>{if(active&&document.visibilityState==="visible"&&navigator.onLine)router.refresh();};
  const timer=window.setInterval(refresh,10000);
  const onVisibility=()=>{if(document.visibilityState==="visible")refresh();};
  document.addEventListener("visibilitychange",onVisibility);
  window.addEventListener("focus",refresh);
  window.addEventListener("online",refresh);
  return()=>{active=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisibility);window.removeEventListener("focus",refresh);window.removeEventListener("online",refresh);};
 },[router]);
 return null;
}
