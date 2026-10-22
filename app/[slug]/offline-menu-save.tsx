"use client";
import {useEffect,useState} from "react";
import {offlineMenuDocument,type OfflineMenu} from "@/lib/restaurant/offline-menu";
export default function OfflineMenuSave({menu,preview,language}:{menu:OfflineMenu;preview:boolean;language:"ar"|"en"|"fr"}){

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
 const savedMessage=language==="ar"?"المنيو محفوظ للتصفح دون اتصال":language==="fr"?"Menu enregistré pour une consultation hors connexion":"Menu saved for offline browsing";
 return saved?<p className="publicMenuOfflineSaved" role="status" aria-live="polite"><span aria-hidden="true">✓</span>{savedMessage}</p>:null;
}
