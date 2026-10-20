"use client";
import {useRef,useState} from "react";
import {StorefrontAddButton} from "./storefront-cart";
type Language="ar"|"en"|"fr";
type VariantPreview={id:string;sku:string|null;images:string[]};
export default function ActivityProductDetails({name,description="",imageUrl,images=[],variantGalleries=[],price,currency,unit,language,slug,id,canAdd=false,service=false}:{name:string;description?:string;imageUrl:string|null;images?:string[];variantGalleries?:VariantPreview[];price:number;currency:string;unit?:string;language:Language;slug:string;id:string;canAdd?:boolean;service?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [group,setGroup]=useState("product"),[selected,setSelected]=useState(0);
 const t=(ar:string,en:string,fr:string)=>language==="ar"?ar:language==="en"?en:fr;
 const basePhotos=images.length?images:imageUrl?[imageUrl]:[];
 const variants=variantGalleries.filter(variant=>variant.images.length>0).slice(0,4);
 const activeVariant=variants.find(variant=>variant.id===group);
 const activePhotos=activeVariant?.images??basePhotos;
 const activeIndex=Math.min(selected,Math.max(0,activePhotos.length-1));
 const close=t("إغلاق","Close","Fermer");
 const label=t("تفاصيل","Details","Détails");
 const cover=basePhotos[0]??variants[0]?.images[0]??null;
 function open(){setGroup(basePhotos.length?"product":variants[0]?.id??"product");setSelected(0);dialog.current?.showModal();}
 function chooseGroup(next:string){setGroup(next);setSelected(0);}
 return <>
  <button type="button" className="foonActivityProductMedia foonActivityPhotoButton" onClick={open} aria-label={label+" "+name}>
   {cover?<img src={cover} alt={name} loading="lazy"/>:<span aria-hidden="true">▦</span>}
  </button>
  <dialog className="foonActivityProductDialog" ref={dialog} aria-label={name} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close()}}>
   <div className="foonActivityProductDialogInner">
    <button type="button" className="foonActivityDialogClose" onClick={()=>dialog.current?.close()} aria-label={close}>×</button>
    {activePhotos.length>0&&<section className="foonActivityGallery" aria-label={t("صور المنتج","Product gallery","Galerie du produit")}>
     <img className="foonActivityDialogImage" src={activePhotos[activeIndex]} alt={name+" — "+(activeIndex+1)+" / "+activePhotos.length}/>
     {activePhotos.length>1&&<div className="foonActivityGalleryThumbs" role="group" aria-label={t("اختيار الصورة","Choose photo","Choisir une photo")}>
      {activePhotos.map((photo,index)=><button type="button" key={index} aria-label={t("الصورة ","Image ","Image ")+(index+1)} aria-pressed={index===activeIndex} onClick={()=>setSelected(index)}><img src={photo} alt="" loading="lazy"/></button>)}
     </div>}
     <small className="foonActivityGalleryCount" dir="ltr">{activeIndex+1} / {activePhotos.length}</small>
    </section>}
    {variants.length>0&&<section className="foonActivityVariantPreview" aria-label={t("صور التركيبات","Variant image previews","Images des variantes")}>
     <p>{t("صور التركيبات للمعاينة فقط. اختر اللون أو المقاس الفعلي عند إضافة المنتج للسلة.","Variant photos are previews only. Select the actual color or size when adding to your cart.","Les images des variantes sont indicatives. Choisissez la couleur ou la taille dans le panier.")}</p>
     <div className="foonActivityVariantPhotoTabs" role="group" aria-label={t("مجموعة الصور","Image set","Série d’images")}>
      {basePhotos.length>0&&<button type="button" aria-pressed={group==="product"} onClick={()=>chooseGroup("product")}>{t("صور المنتج","Product photos","Photos du produit")}</button>}
      {variants.map((variant,index)=><button key={variant.id} type="button" aria-pressed={group===variant.id} onClick={()=>chooseGroup(variant.id)}>{variant.sku?t("تركيبة ","Variant ","Variante ")+variant.sku:t("تركيبة ","Variant ","Variante ")+(index+1)}</button>)}
     </div>
    </section>}
    <h2>{name}</h2>
    {description&&<p>{description}</p>}
    <div className="foonActivityDialogPurchase"><strong dir="ltr">{price.toFixed(2)} {currency}{unit?" / "+unit:""}</strong>{canAdd&&<StorefrontAddButton slug={slug} id={id} language={language} service={service}/>}</div>
   </div>
  </dialog>
 </>;
}
