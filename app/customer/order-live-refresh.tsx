"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";

/** Refresh server-rendered customer data only when an order update is signaled.
 * Background polling should use a lightweight order-status endpoint rather than
 * refreshing the entire customer page on a fixed interval.
 */
export default function OrderLiveRefresh(){
 const router=useRouter();
 useEffect(()=>{
  const onUpdate=()=>router.refresh();
  window.addEventListener("foon:customer-order-updated",onUpdate);
  return()=>window.removeEventListener("foon:customer-order-updated",onUpdate);
 },[router]);
 return null;
}
