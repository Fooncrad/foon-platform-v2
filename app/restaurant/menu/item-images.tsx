"use client";
import {useState} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import MediaPicker from "../media-picker";

type Picture={id:string;image_url:string;sort_order:number};
export default function MenuItemImages({tenantId,item,name,onChanged}:{tenantId:string;item:string;name:string;onChanged:()=>Promise<void>}){
 const language=useUiLanguage(),t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[pictures,setPictures]=useState<Picture[]>([]);
 const [legacy,setLegacy]=useState<string|null>(null),[message,setMessage]=useState("");
 const requestHeaders={"x-foon-tenant":tenantId};
 const effectiveCount=pictures.length+(pictures.length===0&&legacy?1:0);
 async function refresh(){
  const response=await fetch("/api/restaurant/menu/images?item="+encodeURIComponent(item),{headers:requestHeaders,cache:"no-store"});
  const payload=await response.json();
  if(!response.ok||!Array.isArray(payload.images))throw Error(payload.code??"IMAGES_UNAVAILABLE");
  setPictures(payload.images);setLegacy(typeof payload.legacyCover==="string"?payload.legacyCover:null);
 }
 async function change(method:"POST"|"PATCH"|"DELETE",extra:Record<string,unknown>){
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/restaurant/menu/images",{method,headers:{"content-type":"application/json",...requestHeaders},body:JSON.stringify({item,...extra})});
   const result=await r.json();
   if(!r.ok)throw Error(result.code??"IMAGE_SAVE_FAILED");
   await refresh();await onChanged();
   setMessage(t("تم تحديث الصور لجميع اللغات.","Images updated for all languages.","Images mises à jour pour toutes les langues."));
  }catch(e){setMessage(t("تعذر تحديث الصورة: ","Could not update image: ","Impossible de modifier l’image : ")+(e instanceof Error?e.message:""));}
  finally{setBusy(false);}
 }
 async function upload(file:File){
  if(!file.size||file.size>10*1048576||!["image/jpeg","image/png","image/webp"].includes(file.type)){setMessage(t("الصورة يجب أن تكون JPG أو PNG أو WebP وأقل من 10 MB.","Use JPG, PNG or WebP under 10 MB.","Utilisez JPG, PNG ou WebP de moins de 10 Mo."));return;}
  if(effectiveCount>=4){setMessage(t("الحد الأقصى أربع صور.","Maximum four images.","Quatre images maximum."));return;}
  setBusy(true);setMessage("");
  try{
   const form=new FormData();form.set("file",file);
   const response=await fetch("/api/restaurant/assets",{method:"POST",headers:requestHeaders,body:form});
   const data=await response.json();
   if(!response.ok||typeof data.url!=="string")throw Error(data.code??"UPLOAD_FAILED");
   const saved=await fetch("/api/restaurant/menu/images",{method:"POST",headers:{"content-type":"application/json",...requestHeaders},body:JSON.stringify({item,url:data.url})});
   const result=await saved.json();
   if(!saved.ok)throw Error(result.code??"IMAGE_SAVE_FAILED");
   await refresh();await onChanged();
   setMessage(t("تم رفع الصورة وحفظها لجميع اللغات.","Image uploaded and saved for all languages.","Image importée et enregistrée pour toutes les langues."));
  }catch(e){setMessage(t("تعذر رفع الصورة: ","Upload failed: ","Échec de l’importation : ")+(e instanceof Error?e.message:""));}
  finally{setBusy(false);}
 }
 const tile={display:"grid",gap:7,padding:10,border:"1px solid var(--border,#d9e2ee)",borderRadius:12,minWidth:0,maxWidth:220} as const;
 return <div style={{width:"100%",minWidth:0,marginTop:6}}>
  <button type="button" disabled={busy} aria-expanded={open} aria-controls={"menu-images-"+item} onClick={()=>{if(!open){setBusy(true);void refresh().then(()=>setOpen(true)).catch(()=>setMessage(t("تعذر تحميل الصور.","Unable to load images.","Chargement des images impossible."))).finally(()=>setBusy(false));}else setOpen(false);}}>{t("صور الصنف (حتى 4)","Item images (up to 4)","Images de l’article (4 max)")}</button>
  {open&&<section id={"menu-images-"+item} style={{display:"grid",gap:12,padding:12,marginTop:8,border:"1px solid var(--border,#d9e2ee)",borderRadius:12}} aria-label={name}>
   <p style={{margin:0}}>{t("صورة رئيسية وثلاث صور إضافية. الصور نفسها في العربية والإنجليزية والفرنسية.","One cover and three more photos. The same images appear in Arabic, English and French.","Une image principale et trois supplémentaires, communes aux trois langues.")}</p>
   <p dir="ltr" style={{margin:0,fontVariantNumeric:"tabular-nums"}}>{effectiveCount} / 4</p>
   {legacy&&pictures.length===0&&<div style={tile}><img src={legacy} alt={name} width={120} height={120} style={{width:120,height:120,objectFit:"cover",borderRadius:9}}/><small>{t("الصورة الرئيسية القديمة (تُحفظ عند إضافة صورة جديدة)","Existing cover (preserved when adding a new image)","Image existante (conservée lors d’un ajout)")}</small></div>}
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,140px),1fr))",gap:10}}>
    {pictures.map((picture,index)=><div key={picture.id} style={tile}>
     <img src={picture.image_url} alt={name+" "+(index+1)} width={128} height={128} style={{width:128,height:128,maxWidth:"100%",aspectRatio:"1",objectFit:"cover",borderRadius:9}} loading="lazy"/>
     <strong>{index===0?t("الرئيسية","Cover","Principale"):t("الصورة","Image","Image")+" "+(index+1)}</strong>
     <button type="button" disabled={busy||index===0} onClick={()=>void change("PATCH",{ids:[picture.id,...pictures.filter(p=>p.id!==picture.id).map(p=>p.id)]})}>{t("تعيين رئيسية","Make cover","Définir principale")}</button>
     <button type="button" disabled={busy||index===0} onClick={()=>{const ids=pictures.map(p=>p.id);[ids[index-1],ids[index]]=[ids[index],ids[index-1]];void change("PATCH",{ids});}}>{t("تقديم","Move earlier","Avancer")}</button>
     <button type="button" disabled={busy} onClick={()=>void change("DELETE",{id:picture.id})}>{t("إزالة","Remove","Retirer")}</button>
    </div>)}
   </div>
   <label style={{display:"grid",gap:6}}>{t("إضافة صورة من الجهاز","Add image from device","Ajouter depuis l’appareil")}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||effectiveCount>=4} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void upload(file);}}/></label>
   <MediaPicker tenantId={tenantId} disabled={busy||effectiveCount>=4} onSelect={url=>void change("POST",{url})}/>
  </section>}
  {message&&<p role="status" style={{overflowWrap:"anywhere"}}>{message}</p>}
 </div>;
}
