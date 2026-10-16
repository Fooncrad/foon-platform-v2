"use client";
import {useRef,useState} from "react";
export default function StorefrontQr({slug,name,language}:{slug:string;name:string;language:"ar"|"en"|"fr"}){
 const dialog=useRef<HTMLDialogElement>(null),[url,setUrl]=useState("");
 const t=(ar:string,en:string,fr:string)=>language==="ar"?ar:language==="en"?en:fr;
 return <><button type="button" onClick={()=>{setUrl(new URL("/"+encodeURIComponent(slug),window.location.origin).href);dialog.current?.showModal();}}>QR</button><dialog ref={dialog} aria-label={t("رمز واجهة النشاط","Storefront QR code","Code QR de la boutique")} style={{width:"min(360px,calc(100vw - 24px))",border:"1px solid #ddd",borderRadius:20,padding:20,textAlign:"center"}}><h2>{name}</h2>{url&&<><img width={260} height={260} style={{maxWidth:"100%",height:"auto"}} src={"https://quickchart.io/qr?size=360&margin=2&text="+encodeURIComponent(url)} alt={t("رمز رابط النشاط","Storefront link QR","Code du lien de la boutique")}/><p style={{overflowWrap:"anywhere"}} dir="ltr"><a href={url}>{url}</a></p></>}<button type="button" onClick={()=>dialog.current?.close()}>{t("إغلاق","Close","Fermer")}</button></dialog></>;
}
