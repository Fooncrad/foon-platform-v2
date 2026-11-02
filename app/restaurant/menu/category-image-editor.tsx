"use client";
import {useRef,useState} from "react";
import MediaPicker from "../media-picker";
import {useUiLanguage} from "@/lib/i18n/ui-language";
type Category={id:string;name:string;nameEn:string;nameFr:string;imageUrl?:string|null};
/** One public cover per category; the same asset is displayed with all three localized names. */
export default function MenuCategoryImageEditor({tenantId,category,onSaved}:{tenantId:string;category:Category;onSaved:()=>Promise<void>}){
 const lang=useUiLanguage(),t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 const dialog=useRef<HTMLDialogElement>(null);
 const [photo,setPhoto]=useState<string|null>(category.imageUrl??null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function upload(file:File){
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size===0||file.size>10*1048576){setMessage(t("اختر JPG أو PNG أو WebP بحجم لا يتجاوز 10 MB.","Select a JPG, PNG or WebP file up to 10 MB.","Choisissez un fichier JPG, PNG ou WebP de 10 Mo maximum."));return;}
  setBusy(true);setMessage("");
  try{
   const form=new FormData();form.set("file",file);
   const response=await fetch("/api/restaurant/assets",{method:"POST",headers:{"x-foon-tenant":tenantId},body:form});
   const data=await response.json();
   if(!response.ok||typeof data.url!=="string")throw Error(data.code||"IMAGE_UPLOAD_FAILED");
   setPhoto(data.url);
  }catch(e){setMessage(t("تعذر رفع الصورة: ","Image upload failed: ","Échec de l’importation : ")+String(e))}
  finally{setBusy(false);}
 }
 async function save(){
  setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/restaurant/menu/categories",{method:"PATCH",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({id:category.id,name:category.name,nameEn:category.nameEn,nameFr:category.nameFr,imageUrl:photo})});
   const result=await response.json();
   if(!response.ok)throw Error(result.code||"CATEGORY_IMAGE_SAVE_FAILED");
   await onSaved();dialog.current?.close();
  }catch(e){setMessage(t("تعذر حفظ صورة القسم: ","Could not save the category image: ","Impossible d’enregistrer l’image : ")+String(e));}
  finally{setBusy(false);}
 }
 return <>
  <button type="button" disabled={busy} onClick={()=>{setPhoto(category.imageUrl??null);setMessage("");dialog.current?.showModal();}}>{t("صورة القسم","Category photo","Photo de catégorie")}</button>
  <dialog ref={dialog} dir={lang==="ar"?"rtl":"ltr"} aria-label={t("صورة القسم لجميع اللغات","Shared category photo","Photo de catégorie partagée")} style={{width:"min(520px,calc(100vw - 24px))",maxHeight:"85dvh",overflow:"auto",borderRadius:16,padding:20}}>
   <h2>{t("صورة القسم","Category image","Image de catégorie")}</h2>
   <p>{t("صورة واحدة مشتركة للعربية والإنجليزية والفرنسية، ولا تتغير عند تبديل اللغة.","One image shared across Arabic, English and French. Language changes the name only.","Une image commune à l’arabe, l’anglais et le français. Seul le nom change.")}</p>
   {photo?<img src={photo} alt={category.name} width={180} height={180} style={{width:180,height:180,maxWidth:"100%",objectFit:"cover",borderRadius:12}}/>:<p>{t("لم تضف صورة للقسم بعد.","No image has been added.","Aucune image ajoutée.")}</p>}
   <label style={{display:"grid",gap:8,marginBlock:12}}>{t("رفع صورة","Upload photo","Importer une image")}<input disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void upload(file);}}/></label>
   <MediaPicker tenantId={tenantId} disabled={busy} onSelect={setPhoto}/>
   {photo&&<button type="button" disabled={busy} onClick={()=>setPhoto(null)}>{t("إزالة الصورة","Remove photo","Retirer l’image")}</button>}
   {message&&<p role="alert">{message}</p>}
   <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:16}}><button type="button" disabled={busy} onClick={()=>void save()}>{t("حفظ الصورة لجميع اللغات","Save image for all languages","Enregistrer pour toutes les langues")}</button><button type="button" disabled={busy} onClick={()=>dialog.current?.close()}>{t("إلغاء","Cancel","Annuler")}</button></div>
  </dialog>
 </>;
}
