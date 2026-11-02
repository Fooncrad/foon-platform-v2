"use client";
import "./branded-qr.css";
import {defaultQrBranding,parseQrBranding,type QrBranding} from "@/lib/platform/qr-branding";
import {useEffect,useRef,useState} from "react";
type Locale="ar"|"en"|"fr";
const text={ar:{qr:"رمز QR",design:"تخصيص رمز QR",scan:"امسح الرمز لزيارة الصفحة",foreground:"لون الرمز",background:"الخلفية",size:"الحجم",download:"تنزيل الصورة",close:"إغلاق",share:"مشاركة",reset:"الافتراضي",failed:"تعذر تحميل الرمز"},en:{qr:"QR code",design:"Customize QR code",scan:"Scan to open this page",foreground:"Code color",background:"Background",size:"Size",download:"Download image",close:"Close",share:"Share",reset:"Reset",failed:"Could not load QR"},fr:{qr:"Code QR",design:"Personnaliser le QR",scan:"Scannez pour ouvrir cette page",foreground:"Couleur du code",background:"Arrière-plan",size:"Taille",download:"Télécharger l’image",close:"Fermer",share:"Partager",reset:"Réinitialiser",failed:"Impossible de charger le QR"}} as const;
export default function BrandedQr({scope,slug,title,language="ar",logo}:{scope:"platform"|"store"|"customer";slug?:string;title:string;language?:Locale;logo?:string}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [colors,setColors]=useState({ink:"#171613",paper:"#ffffff",size:240});
 const [identity,setIdentity]=useState<QrBranding>(defaultQrBranding);
 const [base,setBase]=useState("");
 const [error,setError]=useState("");
 const t=text[language];
 useEffect(()=>{if(scope==="customer"||scope==="store"&&!slug)return;let live=true;fetch(scope==="platform"?"/api/public/platform-qr-branding":"/api/public/qr-branding?slug="+encodeURIComponent(slug||""),{cache:"no-store"}).then(r=>r.ok?r.json():null).then(j=>{const q=parseQrBranding(j?.settings);if(live&&q){setIdentity(q);setColors({ink:q.ink,paper:q.paper,size:q.size})}}).catch(()=>{});return()=>{live=false}},[scope,slug]);
 function open(){const pathname=scope==="platform"?"/":scope==="customer"?"/customer":"/s/"+encodeURIComponent(slug||"");setBase(new URL(pathname,window.location.origin).href);setError("");dialog.current?.showModal()}
 const imageUrl=base?"https://quickchart.io/qr?size="+colors.size+"&margin=2&dark="+colors.ink.slice(1)+"&light="+colors.paper.slice(1)+"&text="+encodeURIComponent(base):"";
 async function download(){try{
 const response=await fetch(imageUrl);if(!response.ok)throw Error();
 const bitmap=await createImageBitmap(await response.blob());
 const padding=28,qrSize=colors.size,caption=identity[language==="ar"?"captionAr":language==="en"?"captionEn":"captionFr"];
 const logoVisible=Boolean(identity.showLogo&&logo);
 const canvas=document.createElement("canvas");canvas.width=qrSize+padding*2;canvas.height=qrSize+padding*2+54+(logoVisible?65:0);
 const ctx=canvas.getContext("2d");if(!ctx)throw Error();
 ctx.fillStyle=colors.paper;ctx.fillRect(0,0,canvas.width,canvas.height);
 if(identity.frame==="gold"){ctx.strokeStyle="#d2a33e";ctx.lineWidth=8;ctx.strokeRect(4,4,canvas.width-8,canvas.height-8);}
 else if(identity.frame==="rounded"){ctx.strokeStyle=colors.ink;ctx.lineWidth=2;ctx.strokeRect(5,5,canvas.width-10,canvas.height-10);}
 let y=padding;
 if(logoVisible){try{const picture=await fetch(logo!);if(picture.ok){const img=await createImageBitmap(await picture.blob());const scale=Math.min(100/img.width,52/img.height);const w=img.width*scale,h=img.height*scale;ctx.drawImage(img,(canvas.width-w)/2,y,w,h)}}catch{}y+=65;}
 ctx.drawImage(bitmap,padding,y,qrSize,qrSize);
 ctx.fillStyle=colors.ink;ctx.font="bold 16px sans-serif";ctx.textAlign="center";ctx.direction=language==="ar"?"rtl":"ltr";
 ctx.fillText(caption.slice(0,55),canvas.width/2,y+qrSize+30,canvas.width-padding*2);
 const file=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error()),"image/png"));
 const target=URL.createObjectURL(file);const link=document.createElement("a");link.href=target;link.download="foon-"+scope+"-qr.png";link.click();setTimeout(()=>URL.revokeObjectURL(target),1000);
 }catch{setError(t.failed)}}
 async function share(){if(!base)return;if(navigator.share)try{await navigator.share({title,url:base})}catch{}else if(navigator.clipboard)await navigator.clipboard.writeText(base).catch(()=>setError(t.failed))}
 return <><button type="button" className="foonUnifiedQrButton" onClick={open} aria-label={t.qr+" — "+title}>▦ <span>QR</span></button><dialog ref={dialog} className="foonUnifiedQrDialog" aria-label={t.qr} dir={language==="ar"?"rtl":"ltr"}>
 <form method="dialog"><button className="foonUnifiedQrClose" aria-label={t.close}>×</button></form>
 <h2>{title}</h2><p>{t.scan}</p>
 <div className={"foonQrIdentityFrame foonQrFrame-"+identity.frame} style={{background:colors.paper,color:colors.ink}}>{identity.showLogo&&logo&&<img src={logo} alt="" className="foonUnifiedQrLogo"/>}
 {base&&<img className="foonUnifiedQrImage" width={colors.size} height={colors.size} src={imageUrl} alt={t.qr+" — "+title} onError={()=>setError(t.failed)}/>}
 <strong>{identity[language==="ar"?"captionAr":language==="en"?"captionEn":"captionFr"]}</strong></div>
  <div className="foonUnifiedQrActions"><button onClick={download} type="button">{t.download}</button><button onClick={share} type="button">{t.share}</button></div>{error&&<p role="alert">{error}</p>}
 </dialog></>;
}
