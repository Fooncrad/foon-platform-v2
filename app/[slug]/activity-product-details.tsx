"use client";
import {useRef,useState} from "react";
import type {MenuGroup} from "@/lib/restaurant/menu";
import {choicePrice,choicesValid} from "../restaurant/menu-choices";
import {findSelectedVariant,selectedCatalogStockLimit,type CartVariant} from "@/lib/catalog/variant-selection";
import {StorefrontAddButton} from "./storefront-cart";
import {recordProductDetailsVisit} from "@/app/components/public-visit-tracker";
type Language="ar"|"en"|"fr";
type VariantPreview={id:string;sku:string|null;images:string[]};
type ChoicesResponse={item:{price:number;currency:string;measured?:boolean;stock:number|null;variants:CartVariant[]};groups:MenuGroup[]};
export default function ActivityProductDetails({name,description="",imageUrl,images=[],variantGalleries=[],price,currency,unit,language,slug,id,canAdd=false,service=false}:{name:string;description?:string;imageUrl:string|null;images?:string[];variantGalleries?:VariantPreview[];price:number;currency:string;unit?:string;language:Language;slug:string;id:string;canAdd?:boolean;service?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),request=useRef<AbortController|null>(null);
 const [group,setGroup]=useState("product"),[selected,setSelected]=useState(0);
 const [choiceData,setChoiceData]=useState<ChoicesResponse|null>(null),[chosen,setChosen]=useState<string[]>([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState(false);
 const t=(ar:string,en:string,fr:string)=>language==="ar"?ar:language==="en"?en:fr;
 const localized=(v:{name:string;nameEn?:string;nameFr?:string})=>language==="en"?v.nameEn||v.name:language==="fr"?v.nameFr||v.name:v.name;
 const basePhotos=images.length?images:imageUrl?[imageUrl]:[];
 const variants=variantGalleries.filter(variant=>variant.images.length>0).slice(0,4);
 const matched=choiceData?findSelectedVariant(choiceData.item.variants,chosen):undefined;
 const activeVariant=variants.find(variant=>variant.id===group);
 const activePhotos=activeVariant?.images??basePhotos;
 const activeIndex=Math.min(selected,Math.max(0,activePhotos.length-1));
 const close=t("إغلاق","Close","Fermer");
 const label=t("تفاصيل","Details","Détails");
 const cover=basePhotos[0]??variants[0]?.images[0]??null;
 const choicesOkay=Boolean(choiceData&&choicesValid(choiceData.groups,chosen));
 const stockLimit=choiceData?selectedCatalogStockLimit(choiceData.groups,choiceData.item.variants,chosen,choiceData.item.stock):0;
 const available=Boolean(choiceData&&(stockLimit===null||stockLimit>=(choiceData.item.measured?0.001:1)));
 const canConfirm=Boolean(canAdd&&!loading&&!error&&choicesOkay&&available);
 const displayPrice=choiceData&&choicesOkay?choiceData.item.price+choicePrice(choiceData.groups,chosen):price;
 const displayCurrency=choiceData?.item.currency??currency;
 async function loadChoices(){
  request.current?.abort();
  const controller=new AbortController();request.current=controller;
  setLoading(true);setError(false);setChoiceData(null);
  try{
   const response=await fetch("/api/customer/cart?store="+encodeURIComponent(slug)+"&product="+encodeURIComponent(id),{cache:"no-store",signal:controller.signal});
   const data=await response.json();
   if(!response.ok||!data.ok||!data.item||!Array.isArray(data.groups)||!Array.isArray(data.item.variants))throw Error("CART_UNAVAILABLE");
   if(request.current===controller)setChoiceData({item:data.item,groups:data.groups});
  }catch{if(request.current===controller)setError(true);}
  finally{if(request.current===controller)setLoading(false);}
 }
 function open(){
  setGroup(basePhotos.length?"product":variants[0]?.id??"product");
  setSelected(0);setChosen([]);setChoiceData(null);setError(false);
  dialog.current?.showModal();
  recordProductDetailsVisit("catalog_product",slug,id);
  if(canAdd)void loadChoices();
 }
 function chooseGroup(next:string){setGroup(next);setSelected(0);}
 function chooseOptions(next:string[]){
  setChosen(next);
  const variant=findSelectedVariant(choiceData?.item.variants??[],next);
  const preview=variants.find(entry=>entry.id===variant?.id);
  // A matching color/size switches its gallery, but an unknown combination
  // keeps the default photos and cannot be added as an active variant.
  setGroup(preview?.id??"product");
  setSelected(0);
 }
 function closeDialog(){request.current?.abort();request.current=null;dialog.current?.close();}
 return <>
  <button type="button" className="foonActivityProductMedia foonActivityPhotoButton" onClick={open} aria-label={label+" "+name}>
   {cover?<img src={cover} alt={name} loading="lazy"/>:<span aria-hidden="true">▦</span>}
  </button>
  <dialog className="foonActivityProductDialog" ref={dialog} aria-label={name} onClose={()=>{request.current?.abort();request.current=null;}} onClick={e=>{if(e.target===e.currentTarget)closeDialog()}}>
   <div className="foonActivityProductDialogInner">
    <button type="button" className="foonActivityDialogClose" onClick={closeDialog} aria-label={close}>×</button>
    {activePhotos.length>0&&<section className="foonActivityGallery" aria-label={t("صور المنتج","Product gallery","Galerie du produit")}>
     <img className="foonActivityDialogImage" src={activePhotos[activeIndex]} alt={name+" — "+(activeIndex+1)+" / "+activePhotos.length}/>
     {activePhotos.length>1&&<div className="foonActivityGalleryThumbs" role="group" aria-label={t("اختيار الصورة","Choose photo","Choisir une photo")}>
      {activePhotos.map((photo,index)=><button type="button" key={index} aria-label={t("الصورة ","Image ","Image ")+(index+1)} aria-pressed={index===activeIndex} onClick={()=>setSelected(index)}><img src={photo} alt="" loading="lazy"/></button>)}
     </div>}
     <small className="foonActivityGalleryCount" dir="ltr">{activeIndex+1} / {activePhotos.length}</small>
    </section>}
    {variants.length>0&&<section className="foonActivityVariantPreview" aria-label={t("صور التركيبات","Variant image previews","Images des variantes")}>
     <p>{t("اختيار الصورة للمعاينة؛ اللون والمقاس الفعليان يُحدّدان في خيارات الشراء أدناه.","Photos are previews; choose your actual color and size in the options below.","Les photos sont indicatives ; choisissez la couleur et la taille dans les options ci-dessous.")}</p>
     <div className="foonActivityVariantPhotoTabs" role="group" aria-label={t("مجموعة الصور","Image set","Série d’images")}>
      {basePhotos.length>0&&<button type="button" aria-pressed={group==="product"} onClick={()=>chooseGroup("product")}>{t("صور المنتج","Product photos","Photos du produit")}</button>}
      {variants.map((variant,index)=><button key={variant.id} type="button" aria-pressed={group===variant.id} onClick={()=>chooseGroup(variant.id)}>{variant.sku?t("تركيبة ","Variant ","Variante ")+variant.sku:t("تركيبة ","Variant ","Variante ")+(index+1)}</button>)}
     </div>
    </section>}
    <h2>{name}</h2>
    {description&&<p>{description}</p>}
    {canAdd&&<section className="foonActivityVariantChoiceForm" aria-label={t("تحديد اللون والمقاس","Choose color and size","Choisir la couleur et la taille")}>
     {loading&&<p role="status">{t("جارٍ تحميل الخيارات والسعر والمخزون…","Loading options, price and availability…","Chargement des choix, prix et disponibilité…")}</p>}
     {error&&<><p role="alert">{t("تعذر تحميل خيارات المنتج. حاول مجددًا.","Could not load product options. Please retry.","Impossible de charger les options. Réessayez.")}</p><button type="button" onClick={()=>void loadChoices()}>{t("إعادة المحاولة","Retry","Réessayer")}</button></>}
     {choiceData?.groups.map(g=><fieldset key={g.id}><legend>{localized(g)} {g.required?"*":""}</legend>
      {g.values.map(v=><label key={v.id}><input type={g.type==="single"?"radio":"checkbox"} name={"photo-choice-"+id+"-"+g.id} disabled={v.stock!==undefined&&v.stock!==null&&v.stock<=0&&!chosen.includes(v.id)} checked={chosen.includes(v.id)} onChange={e=>{
       const next=g.type==="single"?[...chosen.filter(old=>!g.values.some(option=>option.id===old)),v.id]:e.target.checked?[...chosen,v.id]:chosen.filter(old=>old!==v.id);
       chooseOptions(next);
      }}/><span>{localized(v)}{v.stock!==undefined&&v.stock!==null&&v.stock<=0?" — "+t("نفد المخزون","Out of stock","Épuisé"):""}</span>{v.price!==0&&<small dir="ltr">{v.price>0?"+":""}{v.price.toFixed(2)} {displayCurrency}</small>}</label>)}
     </fieldset>)}
     {choiceData&&chosen.length>0&&!available&&<p role="alert">{t("هذه التركيبة غير متاحة أو نفد مخزونها. اختر تركيبة أخرى.","This combination is unavailable or out of stock. Choose another.","Cette combinaison est indisponible ou épuisée. Choisissez-en une autre.")}</p>}
     {choiceData&&choicesOkay&&available&&matched&&<p role="status">{t("تم تحديد التركيبة المطابقة. ستُراجع الأسعار والكميات عند تسجيل الطلب.","Matching variant selected. Price and stock are checked again at checkout.","Variante correspondante sélectionnée. Prix et stock vérifiés lors de la commande.")}</p>}
    </section>}
    <div className="foonActivityDialogPurchase"><strong dir="ltr">{Number.isFinite(displayPrice)?displayPrice.toFixed(2):price.toFixed(2)} {displayCurrency}{unit?" / "+unit:""}</strong>{canAdd&&<StorefrontAddButton slug={slug} id={id} language={language} service={service} disabled={!canConfirm} options={chosen} onClick={closeDialog}/>}</div>
   </div>
  </dialog>
 </>;
}
