"use client";
import {useEffect,useState} from "react";
import QRCode from "qrcode";
type Session={code:string;token:string;pairUrl:string};
function request(body:object):Promise<{ok:boolean;data:Record<string,unknown>}>{
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open("POST","/api/display/pairing",true);
  xhr.setRequestHeader("content-type","application/json");
  xhr.onreadystatechange=()=>{if(xhr.readyState!==4)return;try{const data=JSON.parse(xhr.responseText||"{}") as Record<string,unknown>;resolve({ok:xhr.status>=200&&xhr.status<300,data});}catch{reject(new Error("INVALID_RESPONSE"));}};
  xhr.onerror=()=>reject(new Error("NETWORK_ERROR"));
  xhr.send(JSON.stringify(body));
 });
}
export default function PairPlayer(){
 const [session,setSession]=useState<Session|null>(null),[qr,setQr]=useState(""),[error,setError]=useState("");
 useEffect(()=>{
  let stopped=false,timer:ReturnType<typeof setInterval>|undefined;
  try{const saved=window.localStorage.getItem("foon_display_token");if(saved&&/^[A-Za-z0-9_-]{32,80}$/.test(saved)){window.location.replace("/display/"+encodeURIComponent(saved));return;}}catch{/* Storage may be disabled on older TV browsers. */}
  void request({action:"start"}).then(async result=>{
   if(!result.ok||typeof result.data.code!=="string"||typeof result.data.token!=="string"||typeof result.data.pairUrl!=="string")throw new Error(String(result.data.code||"PAIRING_UNAVAILABLE"));
   const next={code:result.data.code,token:result.data.token,pairUrl:result.data.pairUrl};
   if(stopped)return;
   setSession(next);
   try{const image=await QRCode.toDataURL(next.pairUrl,{width:280,margin:2,errorCorrectionLevel:"M"});if(!stopped)setQr(image);}catch{/* The short code remains available if QR generation fails. */}
   timer=setInterval(()=>{
    void request({action:"status",token:next.token}).then(status=>{
     if(!status.ok){if(status.data.code==="PAIRING_EXPIRED"){if(timer)clearInterval(timer);setError("انتهت صلاحية الرمز. أعد تحميل الصفحة لإنشاء رمز جديد.");}return;}
     if(status.data.claimed===true&&!stopped){
      if(timer)clearInterval(timer);
      try{window.localStorage.setItem("foon_display_token",next.token);}catch{/* The URL still starts playback for this session. */}
      window.location.replace("/display/"+encodeURIComponent(next.token));
     }
    }).catch(()=>{});
   },2500);
  }).catch(reason=>{if(!stopped)setError(reason instanceof Error?reason.message:"تعذر إنشاء رمز الربط");});
  return()=>{stopped=true;if(timer)clearInterval(timer);};
 },[]);
 return <main style={{position:"fixed",inset:0,background:"#071426",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Arial,sans-serif",padding:24,textAlign:"center"}}>
  <section style={{width:"min(900px,100%)",display:"flex",flexDirection:"column",alignItems:"center",gap:18}}>
   <div style={{fontSize:18,letterSpacing:4,color:"#8eb8df"}}>FOON DISPLAY</div>
   <h1 style={{fontSize:"clamp(28px,5vw,48px)",margin:0}}>اربط هذه الشاشة بحساب FOON</h1>
   <p style={{fontSize:"clamp(16px,2vw,22px)",color:"#c4d4e5",margin:0}}>افتح كاميرا جوالك وامسح الرمز، ثم اختر النشاط والفرع واسم الشاشة</p>
   {session?<><div style={{background:"#fff",padding:12,borderRadius:18,minHeight:qr?304:90,minWidth:qr?304:90,display:"flex",alignItems:"center",justifyContent:"center"}}>{qr?<img src={qr} alt="رمز ربط شاشة FOON" width="280" height="280"/>:<span style={{color:"#111"}}>جارٍ تجهيز رمز QR</span>}</div><div style={{fontSize:16,color:"#a9c4df"}}>أو أدخل الرمز يدوياً</div><div style={{fontSize:"clamp(42px,8vw,76px)",fontWeight:800,letterSpacing:12,fontVariantNumeric:"tabular-nums"}}>{session.code}</div><div style={{color:"#9fb5cc",fontSize:15}}>الرمز صالح لمدة 10 دقائق. ستبدأ الإعلانات تلقائياً بعد الربط.</div></>:<div style={{fontSize:18,color:error?"#ffb4a9":"#b6cce2"}}>{error||"جارٍ إنشاء رمز ربط آمن..."}</div>}
  </section>
 </main>;
}
