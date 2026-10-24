"use client";
import {useState} from "react";
type Language="ar"|"en"|"fr";
export default function CreatorPublicShare({language,profileName}:{language:Language;profileName:string}){
 const [message,setMessage]=useState("");
 const t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 async function share(){
  const url=window.location.href;
  try{
   if(typeof navigator.share==="function"){await navigator.share({title:profileName,url});setMessage("");}
   else{await navigator.clipboard.writeText(url);setMessage(t("تم نسخ رابط البروفايل.","Profile link copied.","Lien du profil copié."));}
  }catch(error){if((error as {name?:string})?.name!=="AbortError")setMessage(t("تعذرت المشاركة؛ انسخ الرابط من شريط العنوان.","Sharing failed; copy the URL from your address bar.","Partage impossible ; copiez l’URL dans la barre d’adresse."));}
 }
 async function copy(){
  try{await navigator.clipboard.writeText(window.location.href);setMessage(t("تم نسخ رابط البروفايل.","Profile link copied.","Lien du profil copié."));}
  catch{setMessage(t("انسخ الرابط من شريط العنوان.","Copy the link from the address bar.","Copiez le lien dans la barre d’adresse."));}
 }
 return <div className="creatorPublicShare"><button type="button" onClick={()=>void share()}>{t("مشاركة البروفايل","Share profile","Partager le profil")}</button><button type="button" onClick={()=>void copy()}>{t("نسخ الرابط","Copy link","Copier le lien")}</button>{message&&<span role="status">{message}</span>}</div>;
}
