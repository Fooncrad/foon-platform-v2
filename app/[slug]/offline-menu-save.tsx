"use client";
import {useEffect,useState} from "react";
import {offlineMenuDocument,type OfflineMenu} from "@/lib/restaurant/offline-menu";
export default function OfflineMenuSave({menu,preview}:{menu:OfflineMenu;preview:boolean}){
 const {name,slug,items,categories,branches}=menu;
 const [saved,setSaved]=useState(false);
 useEffect(()=>{
  if(preview||!navigator.onLine||!("serviceWorker" in navigator))return;
  let cancelled=false;
  void (async()=>{
   const registration=await navigator.serviceWorker.register("/foon-offline-sw.js",{scope:"/"});
   const worker=registration.installing??registration.waiting??registration.active;
   if(!worker)return;
   if(worker.state!=="activated")await new Promise<void>((resolve,reject)=>{
    const changed=()=>{if(worker.state==="activated"||worker.state==="redundant"){worker.removeEventListener("statechange",changed);if(worker.state==="activated")resolve();else reject(new Error("Worker installation failed"));}};
    worker.addEventListener("statechange",changed);changed();
   });
   if(cancelled)return;
   const channel=new MessageChannel();channel.port1.onmessage=event=>{if(!cancelled&&event.data?.ok)setSaved(true);channel.port1.close();};
   worker.postMessage({type:"SAVE_PUBLIC_MENU",slug,html:offlineMenuDocument({name,slug,items,categories,branches}),images:items.map(i=>i.imageUrl).filter(Boolean)},[channel.port2]);
  })().catch(()=>{});
  return()=>{cancelled=true};
 },[name,slug,items,categories,branches,preview]);
 return saved?<p aria-live="polite" style={{padding:"8px 16px",margin:0,fontSize:12}}>المنيو محفوظ للتصفح دون اتصال · Offline menu saved · Menu enregistré hors connexion</p>:null;
}
