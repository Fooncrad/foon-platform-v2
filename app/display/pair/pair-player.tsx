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
   try{const image=await QRCode.toDataURL(next.pairUrl,{width:420,margin:3,errorCorrectionLevel:"H"});if(!stopped)setQr(image);}catch{/* The short code remains available if QR generation fails. */}
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
 return <main style={{position:"fixed",inset:0,boxSizing:"border-box",background:"#071426",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Arial,sans-serif",padding:"max(20px, 4vmin, env(safe-area-inset-top)) max(20px, 4vmin, env(safe-area-inset-right)) max(20px, 4vmin, env(safe-area-inset-bottom)) max(20px, 4vmin, env(safe-area-inset-left))",textAlign:"center",overflowY:"auto",overscrollBehavior:"contain"}}>
  <section style={{boxSizing:"border-box",width:"min(1100px,100%)",maxHeight:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"clamp(7px,1.5vmin,18px)",padding:"clamp(4px,1.5vmin,18px)",margin:"auto"}}>
   <div style={{fontSize:"clamp(12px,1.8vmin,20px)",letterSpacing:"clamp(2px,.35vw,5px)",color:"#8eb8df"}}>FOON DISPLAY</div>
   <h1 style={{fontSize:"clamp(22px,4.2vmin,50px)",lineHeight:1.2,margin:0,maxWidth:"100%",overflowWrap:"anywhere"}}>اربط هذه الشاشة بحساب FOON</h1>
   <p style={{fontSize:"clamp(14px,2.1vmin,24px)",lineHeight:1.45,color:"#c4d4e5",margin:0,maxWidth:900}}>افتح كاميرا جوالك وامسح الرمز، ثم اختر النشاط والفرع واسم الشاشة</p>
   {session?<><div style={{boxSizing:"border-box",background:"#fff",padding:"clamp(6px,1vmin,12px)",borderRadius:18,width:"clamp(160px,min(34vh,32vw),420px)",maxWidth:"min(82vw,55vh)",aspectRatio:"1 / 1",display:"flex",alignItems:"center",justifyContent:"center",flex:"0 1 auto"}}>{qr?<img src={qr} alt="رمز ربط شاشة FOON" style={{display:"block",width:"100%",height:"100%",objectFit:"contain"}}/>:<span style={{color:"#111",fontSize:"clamp(13px,1.8vmin,20px)"}}>جارٍ تجهيز رمز QR</span>}</div><div style={{fontSize:"clamp(13px,1.8vmin,19px)",color:"#a9c4df"}}>أو أدخل الرمز يدوياً</div><div style={{fontSize:"clamp(34px,7vmin,88px)",lineHeight:1.1,fontWeight:800,letterSpacing:"clamp(5px,1.1vw,14px)",fontVariantNumeric:"tabular-nums",maxWidth:"100%",overflowWrap:"anywhere"}}>{session.code}</div><div style={{color:"#9fb5cc",fontSize:"clamp(12px,1.6vmin,18px)",lineHeight:1.4}}>الرمز صالح لمدة 10 دقائق. بعد الربط ستبقى الشاشة بانتظار تفعيلها من لوحة FOON.</div></>:<div style={{fontSize:"clamp(14px,2vmin,22px)",color:error?"#ffb4a9":"#b6cce2",overflowWrap:"anywhere"}}>{error||"جارٍ إنشاء رمز ربط آمن..."}</div>}
  </section>
 </main>;
}
