"use client";
import {useCallback,useEffect,useState} from "react";
import QRCode from "qrcode";
type PlayerResponse={ok:boolean;status:number;json:()=>Promise<unknown>};
async function playerRequest(url:string,options:RequestInit={}):Promise<PlayerResponse>{
 if(typeof window!=="undefined"&&typeof window.fetch==="function"){
  const response=await window.fetch(url,options);
  return {ok:response.ok,status:response.status,json:()=>response.json()};
 }
 return await new Promise<PlayerResponse>((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open(options.method||"GET",url,true);
  const headers=options.headers as Record<string,string>|undefined;
  if(headers)Object.keys(headers).forEach(key=>xhr.setRequestHeader(key,headers[key]));
  xhr.onreadystatechange=()=>{
   if(xhr.readyState!==4)return;
   if(xhr.status===0){reject(new Error("NETWORK_ERROR"));return;}
   resolve({ok:xhr.status>=200&&xhr.status<300,status:xhr.status,json:async()=>JSON.parse(xhr.responseText||"{}")});
  };
  xhr.onerror=()=>reject(new Error("NETWORK_ERROR"));
  xhr.send(typeof options.body==="string"?options.body:null);
 });
}
type Slide={id:string;media_url:string;title_ar:string|null;title_en:string|null;title_fr:string|null;subtitle_ar:string|null;subtitle_en:string|null;subtitle_fr:string|null;duration_seconds:number;external_video_url:string|null;video_loop:boolean;transition_effect:string;badge_text:string|null};
type Payload={screen:{id:string;name:string;refreshSeconds:number;qrEnabled:boolean;qrUrl:string;qrPosition:string;qrSize:number;qrForeground:string;qrBackground:string;displayLayout:string};slides:Slide[]};
export default function DisplayPlayer({token}:{token:string}){
 const [data,setData]=useState<Payload|null>(null),[playback,setPlayback]=useState<{screenId:string;index:number}>({screenId:"",index:0}),[error,setError]=useState(false),[qrResult,setQrResult]=useState<{url:string;dataUrl:string}|null>(null),[pinRequired,setPinRequired]=useState(false),[pin,setPin]=useState(""),[pinError,setPinError]=useState(""),[mediaError,setMediaError]=useState<{slideId:string;source:string;code:string}|null>(null);
 const index=playback.screenId===data?.screen.id?playback.index:0;
 const load=useCallback(async()=>{try{const campaign=typeof window!=="undefined"?(window.location.search.match(/[?&]campaign=([^&]+)/)?.[1]?decodeURIComponent(window.location.search.match(/[?&]campaign=([^&]+)/)![1]):""):"";const query=campaign&&/^[a-z0-9_-]{1,80}$/i.test(campaign)?"?campaign="+encodeURIComponent(campaign):"";const r=await playerRequest("/api/display/"+encodeURIComponent(token)+query,{cache:"no-store"});if(r.status===401){setPinRequired(true);setData(null);setError(false);return;}if(!r.ok)throw Error("DISPLAY_UNAVAILABLE");const d=await r.json() as Payload;setData(d);setPinRequired(false);setError(false);}catch{setError(true);}},[token]);
 useEffect(()=>{const initial=setTimeout(()=>void load(),0);const interval=Math.max(5000,Math.min(120000,(data?.screen.refreshSeconds??15)*1000));const timer=setInterval(()=>void load(),interval);return()=>{clearTimeout(initial);clearInterval(timer);};},[load,data?.screen.refreshSeconds]);
 useEffect(()=>{
  if(!data?.screen.id)return;
  let stopped=false,socket:WebSocket|null=null,retry:ReturnType<typeof setTimeout>|undefined,delay=3000;
  const connect=async()=>{
   try{
    const response=await playerRequest("/api/display/"+encodeURIComponent(token)+"/realtime-ticket",{cache:"no-store"});
    if(!response.ok)throw new Error("REALTIME_TICKET_UNAVAILABLE");
    const auth=await response.json() as {url:string;ticket:string};
    if(stopped)return;
    const url=new URL(auth.url);url.searchParams.set("ticket",auth.ticket);
    socket=new WebSocket(url.toString());
    socket.onopen=()=>{delay=3000;void load();};
    socket.onmessage=event=>{
     try{const message=JSON.parse(String(event.data));if(message?.type==="display.invalidate"&&(!message.screenId||message.screenId===data.screen.id))void load();}catch{/* Ignore malformed gateway messages. */}
    };
    socket.onclose=()=>{if(!stopped){retry=setTimeout(()=>void connect(),delay);delay=Math.min(30000,delay*2);}};
    socket.onerror=()=>socket?.close();
   }catch{if(!stopped){retry=setTimeout(()=>void connect(),delay);delay=Math.min(30000,delay*2);}}
  };
  void connect();
  return()=>{stopped=true;if(retry)clearTimeout(retry);socket?.close(1000,"player cleanup");};
 },[data?.screen.id,token,load]);
 const qrUrl=data?.screen.qrEnabled?data.screen.qrUrl:"";
 useEffect(()=>{if(!qrUrl)return;let active=true;void QRCode.toDataURL(qrUrl,{width:Math.max(80,Math.min(240,data?.screen.qrSize||140)),margin:1,errorCorrectionLevel:"M",color:{dark:data?.screen.qrForeground||"#111827",light:data?.screen.qrBackground||"#ffffff"}}).then(value=>{if(active)setQrResult({url:qrUrl,dataUrl:value});}).catch(()=>{if(active)setQrResult({url:qrUrl,dataUrl:""});});return()=>{active=false;};},[qrUrl,data?.screen.qrSize,data?.screen.qrForeground,data?.screen.qrBackground]);
 const qr=qrResult&&qrResult.url===data?.screen.qrUrl?qrResult.dataUrl:"";
 async function unlockKiosk(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setPinError("");try{const response=await playerRequest("/api/display/"+encodeURIComponent(token),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pin})});if(!response.ok){const result=await response.json().catch(()=>({})) as {code?:string};setPinError(result.code==="KIOSK_TEMPORARILY_LOCKED"?"تم إيقاف المحاولة مؤقتًا. حاول بعد خمس دقائق.":"رمز PIN غير صحيح.");return;}setPin("");setPinRequired(false);await load();}catch{setPinError("تعذر التحقق من الرمز. تحقق من الاتصال وحاول مجددًا.");}}
 const layout=data?.screen.displayLayout??"single";
 const requestedLayoutCount=layout==="double"||layout==="split"?2:layout==="triple"?3:layout==="quad"?4:1;
 const layoutCount=Math.min(requestedLayoutCount,data?.slides.length??1);
 const visibleSlides=data?.slides.length?Array.from({length:Math.min(layoutCount,data.slides.length)},(_,offset)=>data.slides[(index+offset)%data.slides.length]):[];
 const slide=data?.slides[index];
 const activeSlideId=slide?.id??null;
 const activeMediaSource=slide?.external_video_url??slide?.media_url??"";
 useEffect(()=>{
  if(!data?.screen.id)return;
  const report=async()=>{
   const video=document.createElement("video");
   const agent=navigator.userAgent.toLowerCase();
   const platform=/android/.test(agent)?"android":/iphone|ipad|ipod/.test(agent)?"ios":/windows/.test(agent)?"windows":/macintosh|mac os/.test(agent)?"macos":/linux/.test(agent)?"linux":"other";
   const currentMediaError=mediaError&&activeSlideId&&mediaError.slideId===activeSlideId&&mediaError.source===activeMediaSource?mediaError.code:null;
   const errorCode=currentMediaError??(error?"PLAYLIST_UNAVAILABLE":null);
   const payload={platform,playerVersion:"web-1",viewportWidth:window.innerWidth,viewportHeight:window.innerHeight,online:navigator.onLine,visible:typeof document.visibilityState==="string"?document.visibilityState==="visible":true,h264:Boolean(video.canPlayType('video/mp4; codecs="avc1.42E01E"')),webm:Boolean(video.canPlayType('video/webm; codecs="vp9"')),playbackState:error||currentMediaError?"error":activeSlideId?"playing":"idle",errorCode};
   try{await playerRequest("/api/display/"+encodeURIComponent(token)+"/health",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),keepalive:true});}catch{/* The next heartbeat reports recovery. */}
  };
  void report();
  const timer=setInterval(()=>void report(),30000);
  const onVisibility=()=>void report();
  window.addEventListener("online",onVisibility);
  window.addEventListener("offline",onVisibility);
  document.addEventListener("visibilitychange",onVisibility);
  return()=>{clearInterval(timer);window.removeEventListener("online",onVisibility);window.removeEventListener("offline",onVisibility);document.removeEventListener("visibilitychange",onVisibility);};
 },[token,data?.screen.id,error,mediaError,activeSlideId,activeMediaSource,data?.slides.length,index]);
 const transition=(effect:string)=>effect==="zoom"?"foon-display-zoom .9s ease-out":effect==="slide"?"foon-display-slide .7s ease-out":effect==="kenburns"?"foon-display-kenburns 12s ease-in-out infinite alternate":"foon-display-fade .7s ease-out";
 useEffect(()=>{if(!data?.screen.id||!data.slides.length)return;const seconds=Math.max(5,Math.min(120,Number(data.slides[index]?.duration_seconds)||10));const timer=setTimeout(()=>setPlayback({screenId:data.screen.id,index:(index+layoutCount)%data.slides.length}),seconds*1000);return()=>clearTimeout(timer);},[data?.screen.id,data?.slides.length,index,layoutCount,data?.slides]);
 return <main style={{position:"fixed",inset:0,background:"#05080d",color:"white",overflow:"hidden",fontFamily:"Arial,sans-serif"}}><style jsx global>{`@keyframes foon-display-fade{from{opacity:0}to{opacity:1}}@keyframes foon-display-zoom{from{opacity:.5;transform:scale(1.06)}to{opacity:1;transform:scale(1)}}@keyframes foon-display-slide{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}@keyframes foon-display-kenburns{from{transform:scale(1)}to{transform:scale(1.08)}}`}</style>
 {pinRequired&&<div style={{position:"absolute",zIndex:100,inset:0,display:"grid",placeItems:"center",background:"#05080d",padding:24}}><form onSubmit={unlockKiosk} style={{width:"min(100%,380px)",padding:28,border:"1px solid #334155",borderRadius:20,background:"#111827",textAlign:"center"}}><h1 style={{fontSize:28,fontWeight:800}}>شاشة محمية</h1><p style={{margin:"12px 0 20px",color:"#cbd5e1"}}>أدخل رمز PIN لتشغيل شاشة الإعلانات</p><input autoFocus inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} type="password" value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,"").slice(0,8))} aria-label="Kiosk PIN" style={{width:"100%",padding:14,borderRadius:10,textAlign:"center",fontSize:24,letterSpacing:8,color:"#111827"}}/><button type="submit" disabled={pin.length<4} style={{width:"100%",marginTop:14,padding:13,borderRadius:10,background:"#e76f3c",fontWeight:800,opacity:pin.length<4?.5:1}}>فتح الشاشة</button>{pinError&&<p role="alert" style={{marginTop:12,color:"#fca5a5"}}>{pinError}</p>}</form></div>}
 {slide?<><div style={{position:"absolute",inset:0,display:"grid",gridTemplateColumns:layout==="split"?"2fr 1fr":layoutCount===1?"1fr":layoutCount===2?"repeat(2,1fr)":"repeat(2,1fr)",gridTemplateRows:layoutCount>2?"repeat(2,1fr)":"1fr",gap:4}}>{visibleSlides.map(item=><div key={item.id} style={{minWidth:0,minHeight:0,overflow:"hidden",position:"relative",animation:transition(item.transition_effect)}}>{item.external_video_url?<video src={item.external_video_url} autoPlay muted loop={Boolean(item.video_loop)} playsInline onError={()=>setMediaError({slideId:item.id,source:item.external_video_url??item.media_url,code:"MEDIA_PLAYBACK_ERROR"})} onCanPlay={()=>setMediaError(current=>current?.slideId===item.id&&current.source===(item.external_video_url??item.media_url)?null:current)} style={{width:"100%",height:"100%",objectFit:"contain"}}/>:<img src={item.media_url??""} alt="" onError={()=>setMediaError({slideId:item.id,source:item.external_video_url??item.media_url,code:"MEDIA_PLAYBACK_ERROR"})} onLoad={()=>setMediaError(current=>current?.slideId===item.id&&current.source===(item.external_video_url??item.media_url)?null:current)} style={{width:"100%",height:"100%",objectFit:"contain"}}/>}{item.badge_text&&<span style={{position:"absolute",top:14,right:14,padding:"8px 14px",borderRadius:999,background:"#111c2e",color:"white",fontWeight:700}}>{item.badge_text}</span>}</div>)}</div><div style={{position:"absolute",inset:"auto 0 0",padding:"clamp(20px,5vw,64px)",background:"linear-gradient(transparent,rgba(0,0,0,.82))"}}>{(slide.title_ar||slide.title_en||slide.title_fr)&&<h1 style={{fontSize:"clamp(28px,5vw,72px)",margin:"0 0 12px"}}>{slide.title_ar||slide.title_en||slide.title_fr}</h1>}{(slide.subtitle_ar||slide.subtitle_en||slide.subtitle_fr)&&<p style={{fontSize:"clamp(16px,2.4vw,32px)",margin:0}}>{slide.subtitle_ar||slide.subtitle_en||slide.subtitle_fr}</p>}</div><span style={{position:"absolute",top:18,left:22,background:"#0009",padding:"8px 12px",borderRadius:8}}>{data?.screen.name}</span>{qr&&<div style={{position:"absolute",...(data.screen.qrPosition==="top-left"?{top:22,left:22}:data.screen.qrPosition==="top-right"?{top:22,right:22}:data.screen.qrPosition==="bottom-left"?{bottom:22,left:22}:data.screen.qrPosition==="center"?{top:"50%",left:"50%",transform:"translate(-50%,-50%)"}:{bottom:22,right:22}),background:data.screen.qrBackground||"white",padding:10,borderRadius:12,boxShadow:"0 4px 20px #0008"}}><img src={qr} alt="QR" width={Math.max(80,Math.min(240,data.screen.qrSize||140))} height={Math.max(80,Math.min(240,data.screen.qrSize||140))}/></div>}</>:<div style={{height:"100%",display:"grid",placeItems:"center",textAlign:"center",padding:24}}><div><h1 style={{fontSize:36}}>{error?"الشاشة غير متاحة":"شاشة FOON جاهزة"}</h1><p>{error?"تحقق من اتصال الإنترنت أو حالة الشاشة من لوحة التحكم.":"أضف إعلانات مفعلة لتبدأ دورة العرض."}</p></div></div>}
 </main>;
}