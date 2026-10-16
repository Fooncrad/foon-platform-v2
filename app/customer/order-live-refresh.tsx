"use client";
import {useEffect,useRef,useState} from "react";
import {useUiText} from "@/lib/i18n/ui-language";
import {useRouter} from "next/navigation";

/** Refresh only when order data changes, not every polling tick. */
export default function OrderLiveRefresh(){
 const translateUi=useUiText();

 const router=useRouter(),text=useUiText();
 const [unread,setUnread]=useState(0),[sound,setSound]=useState(false),[error,setError]=useState(false);
 const audio=useRef<AudioContext|null>(null);
 function tone(){const ctx=audio.current;if(!ctx||ctx.state!=="running")return;const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.frequency.value=660;gain.gain.value=0.06;oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start();oscillator.stop(ctx.currentTime+0.18);}
 async function toggle(){if(sound){setSound(false);return;}try{const ctx=audio.current??new AudioContext();audio.current=ctx;await ctx.resume();setSound(true);tone();setError(false);}catch{setError(true);}}
 async function acknowledge(){try{const r=await fetch("/api/customer/notifications",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({all:true})});if(!r.ok)throw Error();setUnread(0);router.refresh();}catch{setError(true);}}
 useEffect(()=>{if(!sound||!unread)return;tone();const timer=setInterval(tone,12000);return()=>clearInterval(timer);},[sound,unread]);
 useEffect(()=>()=>{void audio.current?.close();},[]);
 useEffect(()=>{
  let alive=true;
  let previous:string|null=null;
  let hadFailure=false;
  let reservationsWereUnavailable=false;
  let inFlight=false;
  let activeController:AbortController|null=null;
  let lastCheck=0;
  async function check(){
   if(!alive||inFlight||document.visibilityState!=="visible"||!navigator.onLine||Date.now()-lastCheck<1500)return;
   lastCheck=Date.now();
   inFlight=true;
   const controller=new AbortController();
   activeController=controller;
   const timeout=window.setTimeout(()=>controller.abort(),8000);
   try{
    const response=await fetch("/api/customer/order-revision",{cache:"no-store",signal:controller.signal});
    if(!response.ok){hadFailure=true;setError(true);return;}
    const body=await response.json() as {revision?:string;reservationsAvailable?:boolean;unread?:number};
    if(!alive)return;
    if(typeof body.revision!=="string"){hadFailure=true;return;}
    setUnread(Number.isInteger(body.unread)&&Number(body.unread)>=0?Number(body.unread):0);
    setError(false);
    const recovered=reservationsWereUnavailable&&body.reservationsAvailable===true;
    if(previous!==body.revision||hadFailure||recovered)router.refresh();
    reservationsWereUnavailable=body.reservationsAvailable===false;
    hadFailure=false;
    previous=body.revision;
   }catch{if(alive){hadFailure=true;setError(true);}}
   finally{window.clearTimeout(timeout);if(activeController===controller)activeController=null;inFlight=false;}
  }
  void check();
  const timer=window.setInterval(()=>void check(),10000);
  const onVisibility=()=>void check();
  document.addEventListener("visibilitychange",onVisibility);
  window.addEventListener("online",onVisibility);
  return()=>{alive=false;activeController?.abort();window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisibility);window.removeEventListener("online",onVisibility);};
 },[router]);
 return <section className="customerLiveControls" aria-label={text(translateUi("تنبيهات الطلبات"))}><button type="button" aria-pressed={sound} onClick={()=>void toggle()}>{text(sound?translateUi("كتم التنبيهات"):translateUi("تفعيل صوت التنبيهات"))}</button>{unread>0&&<p role="status">{text(translateUi("إشعارات غير مقروءة:"))} {unread} <button type="button" onClick={()=>void acknowledge()}>{text(translateUi("تحديد الكل كمقروء"))}</button></p>}{error&&<p role="alert">{text(translateUi("تعذر تحديث التنبيهات. حاول مجددًا."))}</p>}</section>;
}
