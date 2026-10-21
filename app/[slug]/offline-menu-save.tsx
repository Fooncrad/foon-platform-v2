"use client";
import {useEffect,useState} from "react";
import {offlineMenuDocument,type OfflineMenu} from "@/lib/restaurant/offline-menu";
type Language="ar"|"en"|"fr";
type SaveState={images:number;missing:number}|null;
export default function OfflineMenuSave({menu,preview,language}:{menu:OfflineMenu;preview:boolean;language:Language}){
 const {name,slug,items,categories,branches,options,branding}=menu;
 const [saved,setSaved]=useState<SaveState>(null);
 useEffect(()=>{
  if(preview||!navigator.onLine||!("serviceWorker" in navigator))return;
  let cancelled=false;
  setSaved(null);
  void(async()=>{
   const registration=await navigator.serviceWorker.register("/foon-offline-sw.js",{scope:"/"});
   const worker=registration.installing??registration.waiting??registration.active;
   if(!worker)return;
   if(worker.state!=="activated")await new Promise<void>((resolve,reject)=>{
    const changed=()=>{if(worker.state==="activated"||worker.state==="redundant"){worker.removeEventListener("statechange",changed);if(worker.state==="activated")resolve();else reject(new Error("Worker installation failed"));}};
    worker.addEventListener("statechange",changed);changed();
   });
   if(cancelled)return;
   const channel=new MessageChannel();
   channel.port1.onmessage=event=>{
    if(!cancelled&&event.data?.ok)setSaved({images:Number(event.data.savedImages??0),missing:Number(event.data.missingImages??0)});
    channel.port1.close();
   };
   const images=[
    ...items.flatMap(i=>[i.imageUrl,...(i.images??[])]),
    ...categories.map(c=>c.imageUrl),
    ...Object.values(options??{}).flatMap(groups=>groups.flatMap(g=>g.values.map(v=>v.imageUrl))),
    branding?.coverUrl,branding?.iconUrl,branding?.logoUrl
   ].filter((url):url is string=>typeof url==="string"&&/^\/api\/restaurant\/assets\/[a-f0-9-]{36}$/i.test(url));
   worker.postMessage({type:"SAVE_PUBLIC_MENU",slug,html:offlineMenuDocument(menu,Date.now(),language),images:[...new Set(images)]},[channel.port2]);
  })().catch(()=>{});
  return()=>{cancelled=true;};
 },[name,slug,items,categories,branches,options,branding,preview,language]);
 if(!saved)return null;
 const full=language==="ar"?"المنيو محفوظ بكل تفاصيله للتصفح دون اتصال":language==="fr"?"Menu enregistré pour consultation hors connexion":"Menu saved for offline browsing";
 const partial=language==="ar"?"بعض الصور لم تُحفظ؛ ستظل تفاصيل الأصناف متاحة.":language==="fr"?"Certaines images n'ont pas été enregistrées ; les détails restent consultables.":"Some images were not saved; menu details remain available.";
 return <p className="publicMenuOfflineSaved" role="status" aria-live="polite"><span aria-hidden="true">✓</span>{full}{saved.missing>0?" — "+partial:""}</p>;
}
