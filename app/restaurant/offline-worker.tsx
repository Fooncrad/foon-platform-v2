"use client";
import {useEffect} from "react";
export default function OfflineWorker(){
 useEffect(()=>{
  if(!("serviceWorker" in navigator)||location.protocol!=="https:"&&location.hostname!=="localhost")return;
  void navigator.serviceWorker.register("/foon-offline-sw.js",{scope:"/"}).catch(()=>{});
 },[]);
 return null;
}
