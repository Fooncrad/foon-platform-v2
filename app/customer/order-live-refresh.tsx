"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";

/** Refresh only when order data changes, not every polling tick. */
export default function OrderLiveRefresh(){
 const router=useRouter();
 useEffect(()=>{
  let alive=true;
  let previous:string|null=null;
  let inFlight=false;
  async function check(){
   if(!alive||inFlight||document.visibilityState!=="visible"||!navigator.onLine)return;
   inFlight=true;
   try{
    const response=await fetch("/api/customer/order-revision",{cache:"no-store"});
    if(!response.ok)return;
    const body=await response.json() as {revision?:string};
    if(typeof body.revision!=="string")return;
    if(previous!==null&&previous!==body.revision)router.refresh();
    previous=body.revision;
   }catch{/* Keep the last known state when connectivity fails. */}
   finally{inFlight=false;}
  }
  void check();
  const timer=window.setInterval(()=>void check(),10000);
  const onVisibility=()=>void check();
  document.addEventListener("visibilitychange",onVisibility);
  window.addEventListener("online",onVisibility);
  return()=>{alive=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisibility);window.removeEventListener("online",onVisibility);};
 },[router]);
 return null;
}
