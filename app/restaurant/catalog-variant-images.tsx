"use client";
import {useEffect,useState} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
type Photo={id:string;image_url:string};
export default function CatalogVariantImages({tenantId,product,variant}:{tenantId:string;product:string;variant:string}){
 const lang=useUiLanguage(),t=(ar:string,en:string,fr:string)=>lang==="ar"?ar:lang==="en"?en:fr;
 const [images,setImages]=useState<Photo[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const url="/api/restaurant/activity-catalog/variant-images";
 async function refresh(){
  const r=await fetch(url+"?"+new URLSearchParams({product,variant}),{headers:{"x-foon-tenant":tenantId},cache:"no-store"});
  const d=await r.json();if(!r.ok||!Array.isArray(d.images))throw Error(d.code??"LOAD_FAILED");setImages(d.images);
 }
 useEffect(()=>{
  let cancelled = false;
  const params = new URLSearchParams({product,variant});

  fetch("/api/restaurant/activity-catalog/variant-images?"+params,{
    headers:{"x-foon-tenant":tenantId},
    cache:"no-store"
  })
    .then(async response=>{
      const data = await response.json();
      if(!response.ok || !Array.isArray(data.images))
        throw Error(data.code??"LOAD_FAILED");
      return data.images as Photo[];
    })
    .then(data=>{
      if(!cancelled) setImages(data);
    })
    .catch(()=>{
      if(!cancelled)
        setError(lang==="ar"?"تعذر جلب الصور":
                 lang==="en"?"Could not load images":
                 "Chargement impossible");
    });

  return ()=>{cancelled=true};
},[tenantId,product,variant,lang]);
 async function mutate(method:"POST"|"PATCH"|"DELETE",payload:FormData|Record<string,unknown>){
  setBusy(true);setError("");
  try{
   const r=await fetch(url,{method,headers:{"x-foon-tenant":tenantId,...(payload instanceof FormData?{}:{"content-type":"application/json"})},body:payload instanceof FormData?payload:JSON.stringify({product,variant,...payload})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.code??"SAVE_FAILED");await refresh();
  }catch(e){setError(t("تعذر حفظ صور المتغير","Unable to save variant images","Enregistrement impossible")+" "+String(e))}finally{setBusy(false)}
 }
 return <section style={{marginTop:12,padding:12,border:"1px solid #8885",borderRadius:10}}>
  <strong>{t("صور هذه التركيبة","Images for this combination","Images de cette combinaison")}</strong>
  <p>{t("4 صور كحد أقصى، كل صورة 2 MB. الأولى رئيسية.","Up to 4 images, 2 MB each. First is primary.","4 images maximum, 2 Mo chacune. La première est principale.")}</p>
  <label>{t("تحميل من الجهاز","Upload from device","Importer depuis l’appareil")}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||images.length>=4} onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(!f)return;if(!["image/png","image/jpeg","image/webp"].includes(f.type)||!f.size||f.size>2*1024*1024){setError(t("ملف غير صالح","Invalid image","Image invalide"));return}const data=new FormData();data.set("product",product);data.set("variant",variant);data.set("file",f);void mutate("POST",data)}}/></label>
  <div style={{display:"flex",flexWrap:"wrap",gap:12}}>{images.map((img,i)=><div key={img.id} style={{maxWidth:120}}><img src={img.image_url} width={110} height={110} alt={t("صورة متغير","Variant image","Image de variante")} style={{objectFit:"cover",maxWidth:"100%"}}/>{i===0&&<small>{t("الرئيسية","Primary","Principale")}</small>}<button type="button" disabled={busy||i===0} onClick={()=>void mutate("PATCH",{ids:[img.id,...images.filter(v=>v.id!==img.id).map(v=>v.id)]})}>{t("رئيسية","Set primary","Principale")}</button><button type="button" disabled={busy||i===0} onClick={()=>{const ids=images.map(v=>v.id);[ids[i-1],ids[i]]=[ids[i],ids[i-1]];void mutate("PATCH",{ids})}}>{t("تقديم","Move up","Avancer")}</button><button type="button" disabled={busy} onClick={()=>void mutate("DELETE",{id:img.id})}>{t("حذف","Remove","Supprimer")}</button></div>)}</div>
  {error&&<p role="alert">{error}</p>}
 </section>
}
