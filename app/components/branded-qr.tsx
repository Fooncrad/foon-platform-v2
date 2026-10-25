"use client";
import {useEffect,useRef,useState} from "react";
type Locale="ar"|"en"|"fr";
const clean=(value:unknown,fallback:string)=>typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback;
const text={ar:{qr:"رمز QR",design:"تخصيص رمز QR",scan:"امسح الرمز لزيارة الصفحة",foreground:"لون الرمز",background:"الخلفية",size:"الحجم",download:"تنزيل الصورة",close:"إغلاق",share:"مشاركة",reset:"الافتراضي",failed:"تعذر تحميل الرمز"},en:{qr:"QR code",design:"Customize QR code",scan:"Scan to open this page",foreground:"Code color",background:"Background",size:"Size",download:"Download image",close:"Close",share:"Share",reset:"Reset",failed:"Could not load QR"},fr:{qr:"Code QR",design:"Personnaliser le QR",scan:"Scannez pour ouvrir cette page",foreground:"Couleur du code",background:"Arrière-plan",size:"Taille",download:"Télécharger l’image",close:"Fermer",share:"Partager",reset:"Réinitialiser",failed:"Impossible de charger le QR"}} as const;
export default function BrandedQr({scope,slug,title,language="ar",logo}:{scope:"platform"|"store"|"customer";slug?:string;title:string;language?:Locale;logo?:string}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [colors,setColors]=useState({ink:"#171613",paper:"#ffffff",size:240});
 const [base,setBase]=useState("");
 const [error,setError]=useState("");
 const t=text[language];
 const key="foon-qr-style:"+scope+":"+(slug||"global");
 useEffect(()=>{try{const data=JSON.parse(localStorage.getItem(key)||"null");if(data)setColors({ink:clean(data.ink,"#171613"),paper:clean(data.paper,"#ffffff"),size:[200,240,300].includes(data.size)?data.size:240})}catch{}},[key]);
 function update(next:typeof colors){setColors(next);try{localStorage.setItem(key,JSON.stringify(next))}catch{}}
 function open(){const pathname=scope==="platform"?"/":scope==="customer"?"/customer":"/s/"+encodeURIComponent(slug||"");setBase(new URL(pathname,window.location.origin).href);setError("");dialog.current?.showModal()}
 const imageUrl=base?"https://quickchart.io/qr?size="+colors.size+"&margin=2&dark="+colors.ink.slice(1)+"&light="+colors.paper.slice(1)+"&text="+encodeURIComponent(base):"";
 async function download(){try{const response=await fetch(imageUrl);if(!response.ok)throw Error();const blob=await response.blob();const target=URL.createObjectURL(blob);const a=document.createElement("a");a.href=target;a.download="foon-"+scope+"-qr.png";a.click();URL.revokeObjectURL(target)}catch{setError(t.failed)}}
 async function share(){if(!base)return;if(navigator.share)try{await navigator.share({title,url:base})}catch{}else if(navigator.clipboard)await navigator.clipboard.writeText(base).catch(()=>setError(t.failed))}
 return <><button type="button" className="foonUnifiedQrButton" onClick={open} aria-label={t.qr+" — "+title}>▦ <span>QR</span></button><dialog ref={dialog} className="foonUnifiedQrDialog" aria-label={t.design} dir={language==="ar"?"rtl":"ltr"}>
 <form method="dialog"><button className="foonUnifiedQrClose" aria-label={t.close}>×</button></form>
 <h2>{title}</h2><p>{t.scan}</p>
 {logo&&<img src={logo} alt="" className="foonUnifiedQrLogo"/>}
 {base&&<img className="foonUnifiedQrImage" width={colors.size} height={colors.size} src={imageUrl} alt={t.qr+" — "+title} onError={()=>setError(t.failed)}/>}
 <fieldset><legend>{t.design}</legend><label>{t.foreground}<input type="color" value={colors.ink} onChange={e=>update({...colors,ink:e.target.value})}/></label><label>{t.background}<input type="color" value={colors.paper} onChange={e=>update({...colors,paper:e.target.value})}/></label><label>{t.size}<select value={colors.size} onChange={e=>update({...colors,size:Number(e.target.value)})}><option value="200">200</option><option value="240">240</option><option value="300">300</option></select></label></fieldset>
 <div className="foonUnifiedQrActions"><button onClick={download} type="button">{t.download}</button><button onClick={share} type="button">{t.share}</button><button type="button" onClick={()=>update({ink:"#171613",paper:"#ffffff",size:240})}>{t.reset}</button></div>{error&&<p role="alert">{error}</p>}
 </dialog></>;
}
