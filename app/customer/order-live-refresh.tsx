"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";

/** Refresh only when order data changes, not every polling tick. */
export default function OrderLiveRefresh(){
 const router=useRouter();
 useEffect(()=>{
  let alive=true;
  let previous:string|null=null;
  let hadFailure=false;
  let reservationsWereUnavailable=false;
  let inFlight=false;
  async function check(){
   if(!alive||inFlight||document.visibilityState!=="visible"||!navigator.onLine)return;
   inFlight=true;
   try{
    const response=await fetch("/api/customer/order-revision",{cache:"no-store"});
    if(!response.ok){hadFailure=true;return;}
    const body=await response.json() as {revision?:string;reservationsAvailable?:boolean};
    if(typeof body.revision!=="string")return;
    const recovered=reservationsWereUnavailable&&body.reservationsAvailable===true;
    if((previous!==null&&previous!==body.revision)||hadFailure||recovered)router.refresh();
    reservationsWereUnavailable=body.reservationsAvailable===false;
    hadFailure=false;
    previous=body.revision;
   }catch{hadFailure=true;}
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
