"use client";
import {useCallback,useEffect,useState} from "react";
type Slide={id:string;media_url:string;title_ar:string|null;title_en:string|null;title_fr:string|null;subtitle_ar:string|null;subtitle_en:string|null;subtitle_fr:string|null;duration_seconds:number};
type Payload={screen:{id:string;name:string;refreshSeconds:number;qrEnabled:boolean};slides:Slide[]};
export default function DisplayPlayer({token}:{token:string}){
 const [data,setData]=useState<Payload|null>(null),[index,setIndex]=useState(0),[error,setError]=useState(false);
 const load=useCallback(async()=>{try{const r=await fetch("/api/display/"+encodeURIComponent(token),{cache:"no-store"});if(!r.ok)throw Error("DISPLAY_UNAVAILABLE");const d=await r.json();setData(d);setError(false);}catch{setError(true);}},[token]);
 useEffect(()=>{void load();const interval=Math.max(5000,Math.min(120000,(data?.screen.refreshSeconds??15)*1000));const timer=setInterval(()=>void load(),interval);return()=>clearInterval(timer);},[load,data?.screen.refreshSeconds]);
 useEffect(()=>{setIndex(0);if(!data?.slides.length)return;const seconds=Math.max(5,Math.min(120,Number(data.slides[index]?.duration_seconds)||10));const timer=setTimeout(()=>setIndex(i=>(i+1)%data.slides.length),seconds*1000);return()=>clearTimeout(timer);},[data,index]);
 const slide=data?.slides[index];
 return <main style={{position:"fixed",inset:0,background:"#05080d",color:"white",overflow:"hidden",fontFamily:"Arial,sans-serif"}}>
 {slide?<><img key={slide.id} src={slide.media_url} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain"}}/><div style={{position:"absolute",inset:"auto 0 0",padding:"clamp(20px,5vw,64px)",background:"linear-gradient(transparent,rgba(0,0,0,.82))"}}>{(slide.title_ar||slide.title_en||slide.title_fr)&&<h1 style={{fontSize:"clamp(28px,5vw,72px)",margin:"0 0 12px"}}>{slide.title_ar||slide.title_en||slide.title_fr}</h1>}{(slide.subtitle_ar||slide.subtitle_en||slide.subtitle_fr)&&<p style={{fontSize:"clamp(16px,2.4vw,32px)",margin:0}}>{slide.subtitle_ar||slide.subtitle_en||slide.subtitle_fr}</p>}</div><span style={{position:"absolute",top:18,left:22,background:"#0009",padding:"8px 12px",borderRadius:8}}>{data?.screen.name}</span></>:<div style={{height:"100%",display:"grid",placeItems:"center",textAlign:"center",padding:24}}><div><h1 style={{fontSize:36}}>{error?"الشاشة غير متاحة":"شاشة FOON جاهزة"}</h1><p>{error?"تحقق من اتصال الإنترنت أو حالة الشاشة من لوحة التحكم.":"أضف إعلانات مفعلة لتبدأ دورة العرض."}</p></div></div>}
 </main>;
}