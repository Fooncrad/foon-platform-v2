"use client";
import {useRef} from "react";
import {StorefrontAddButton} from "./storefront-cart";
type Language="ar"|"en"|"fr";
export default function ActivityProductDetails({name,description,imageUrl,price,currency,unit,language,slug,id,canAdd=false,service=false}:{name:string;description:string;imageUrl:string|null;price:number;currency:string;unit?:string;language:Language;slug:string;id:string;canAdd?:boolean;service?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null);
 const label=language==="ar"?"تفاصيل":language==="fr"?"Détails":"Details";
 const close=language==="ar"?"إغلاق":language==="fr"?"Fermer":"Close";
 return <>
  <button type="button" className="foonActivityProductMedia foonActivityPhotoButton" onClick={()=>dialog.current?.showModal()} aria-label={label+" "+name}>
   {imageUrl?<img src={imageUrl} alt={name} loading="lazy"/>:<span aria-hidden="true">▦</span>}
  </button>
  <dialog className="foonActivityProductDialog" ref={dialog} aria-label={name} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close()}}>
   <div className="foonActivityProductDialogInner">
    <button type="button" className="foonActivityDialogClose" onClick={()=>dialog.current?.close()} aria-label={close}>×</button>
    {imageUrl&&<img className="foonActivityDialogImage" src={imageUrl} alt={name}/>}
    <h2>{name}</h2>
    {description&&<p>{description}</p>}
    <div className="foonActivityDialogPurchase"><strong dir="ltr">{price.toFixed(2)} {currency}{unit?" / "+unit:""}</strong>{canAdd&&<StorefrontAddButton slug={slug} id={id} language={language} service={service}/>}</div>
   </div>
  </dialog>
 </>;
}
