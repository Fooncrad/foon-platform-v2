"use client";
import CheckoutBreakdown from "../restaurant/checkout-breakdown";
import type {CheckoutPolicy} from "@/lib/restaurant/checkout-pricing";
import {validCatalogQuantity} from "@/lib/platform/catalog-measurements";
import {useUiText} from "@/lib/i18n/ui-language";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {useRouter} from "next/navigation";
import InlineCustomerAuth from "./inline-customer-auth";
import {cartKey,choicePrice,choicesValid} from "../restaurant/menu-choices";
import type {MenuGroup} from "@/lib/restaurant/menu";
import "./storefront-cart.css";
type Language="ar"|"en"|"fr";
type Item={measured?:boolean;unit?:string;variants?:{options:string[];stock:number|null}[];id:string;name:string;nameEn:string;nameFr:string;price:number;currency:string;branches:{id:string;name:string}[]};
type Line={key:string;item:Item;options:string[];optionNames:string[];quantity:number;unitPrice:number};
const uuid=/^[a-f0-9-]{36}$/i;
function validLine(value:unknown):value is Line{
 if(!value||typeof value!=="object")return false;
 const v=value as Line,p=v.item;
 return !!p&&uuid.test(p.id)&&typeof p.name==="string"&&p.name.length<=180&&typeof p.nameEn==="string"&&typeof p.nameFr==="string"&&/^[A-Z]{3}$/.test(p.currency)&&Array.isArray(p.branches)&&p.branches.length<=100&&p.branches.every(b=>uuid.test(b.id)&&typeof b.name==="string")&&Array.isArray(v.options)&&v.options.length<=100&&v.options.every(id=>typeof id==="string"&&uuid.test(id))&&Array.isArray(v.optionNames)&&v.optionNames.length<=100&&v.optionNames.every(n=>typeof n==="string"&&n.length<=180)&&v.key===cartKey(p.id,v.options)&&validCatalogQuantity(v.quantity)&&(p.measured||Number.isInteger(v.quantity))&&Number.isFinite(v.unitPrice)&&v.unitPrice>=0;
}
const subscribeHydration=()=>()=>{};
function storedLines(storage:string):Line[]{
 if(typeof window==="undefined")return [];
 try{const saved=JSON.parse(sessionStorage.getItem(storage)??"[]");if(Array.isArray(saved)&&saved.length<=40&&saved.every(validLine))return saved;}catch{}
 return [];
}
export function StorefrontAddButton({slug,id,language,service=false}:{slug:string;id:string;language:Language;service?:boolean}){
 const translateUi=useUiText();

 const text=language==="ar"?(service?"إضافة الخدمة":translateUi("إضافة إلى السلة")):language==="fr"?(service?"Ajouter le service":"Ajouter au panier"):(service?"Add service":"Add to cart");
 return <button type="button" className="foonCartAdd" onClick={()=>window.dispatchEvent(new CustomEvent("foon:storefront-cart-add",{detail:{slug,id}}))}>{text}</button>;
}
export default function StorefrontCart({checkoutPolicy,slug,language,signedIn=false,linked=false,service=false,customerPhone="",deliveryAddress=""}:{checkoutPolicy?:CheckoutPolicy;slug:string;language:Language;signedIn?:boolean;linked?:boolean;service?:boolean;customerPhone?:string;deliveryAddress?:string}){
 const tr=(ar:string,en:string,fr:string)=>language==="ar"?ar:language==="fr"?fr:en;
 const title=service?tr("سلة الخدمات","Service basket","Panier de services"):tr("سلة المشتريات","Shopping cart","Panier");
 const storage="foon-public-cart:"+slug;
 const mounted=useSyncExternalStore(subscribeHydration,()=>true,()=>false);
 const [lines,setLines]=useState<Line[]>(()=>storedLines(storage)),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[ready,setReady]=useState(linked),[branch,setBranch]=useState(""),[channel,setChannel]=useState("takeaway");
 const router=useRouter();
 const [enteredPhone,setPhone]=useState<string|null>(null),[enteredAddress,setAddress]=useState<string|null>(null);
 const phone=enteredPhone??customerPhone,address=enteredAddress??deliveryAddress;
 const [quantityDrafts,setQuantityDrafts]=useState<Record<string,string>>({});
 const [pending,setPending]=useState<{item:Item;groups:MenuGroup[]}|null>(null),[selected,setSelected]=useState<string[]>([]);
 const busyRef=useRef(false);
 function setWorking(value:boolean){busyRef.current=value;setBusy(value);}
 const requestRef=useRef<{payload:string;key:string}|null>(null);
 const panel=useRef<HTMLElement>(null);
 const localized=(item:{name:string;nameEn?:string;nameFr?:string})=>language==="en"?item.nameEn||item.name:language==="fr"?item.nameFr||item.name:item.name;
 const error=(code:string)=>code==="INSUFFICIENT_STOCK"?tr("الكمية المطلوبة غير متاحة. عدّل السلة.","Requested quantity is unavailable. Update your cart.","Quantité indisponible. Modifiez le panier."):code==="INVALID_OPTIONS"?tr("راجع خيارات الأصناف وأضفها مجددًا.","Review item options and add them again.","Vérifiez les options et ajoutez à nouveau les articles."):tr("تعذر إكمال العملية. راجع البيانات وحاول مجددًا.","Unable to continue. Check the details and try again.","Impossible de continuer. Vérifiez les informations et réessayez.");
 useEffect(()=>{if(mounted)try{sessionStorage.setItem(storage,JSON.stringify(lines));}catch{}},[lines,mounted,storage]);
 useEffect(()=>{
  let active=true;
  const handler=async(event:Event)=>{
   const detail=(event as CustomEvent<{slug?:string;id?:string}>).detail;
   if(detail?.slug!==slug||typeof detail.id!=="string"||!uuid.test(detail.id))return;
   if(busyRef.current)return;
   setWorking(true);setMessage("");
   try{
    const r=await fetch("/api/customer/cart?store="+encodeURIComponent(slug)+"&product="+encodeURIComponent(detail.id),{cache:"no-store"}),body=await r.json();
    if(!r.ok||!body.ok)throw Error(body.code??"CART_UNAVAILABLE");
    if(active){setPending({item:body.item,groups:body.groups});setSelected([]);panel.current?.scrollIntoView({block:"nearest"});}
   }catch(e){if(active)setMessage(error(e instanceof Error?e.message:""));}finally{if(active)setWorking(false);}
  };
  window.addEventListener("foon:storefront-cart-add",handler);return()=>{active=false;window.removeEventListener("foon:storefront-cart-add",handler);};
 // Messages follow the server-rendered storefront locale.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[slug,language]);
 const branches=lines.length?lines[0].item.branches.filter(b=>lines.every(line=>line.item.branches.some(option=>option.id===b.id))):[];
 const chosenBranch=branches.some(b=>b.id===branch)?branch:branches[0]?.id??"";
 const currency=lines[0]?.item.currency??pending?.item.currency??"";
 const deliveryReady=channel!=="delivery"||(/^\+?[\d ()-]{7,40}$/.test(phone)&&phone.replace(/\D/g,"").length>=7&&address.trim().length>=5&&address.length<=900);
 const validDrafts=lines.every(line=>quantityDrafts[line.key]===undefined||(validCatalogQuantity(Number(quantityDrafts[line.key]))&&(line.item.measured||Number.isInteger(Number(quantityDrafts[line.key])))));
 const total=lines.reduce((sum,line)=>sum+Math.round(Math.round(line.unitPrice*100)*Math.round(line.quantity*1000)/1000)/100,0),count=lines.reduce((sum,line)=>sum+line.quantity,0);
 function variantAvailable(item:Item,ids:string[]){return !item.variants?.length||item.variants.some(v=>v.options.length===ids.length&&v.options.every(id=>ids.includes(id))&&(v.stock===null||v.stock>0))}
 function add(){
  if(!pending||!choicesValid(pending.groups,selected)||!variantAvailable(pending.item,selected))return;
  const {item,groups}=pending,key=cartKey(item.id,selected),unitPrice=item.price+choicePrice(groups,selected);
  if(!Number.isFinite(unitPrice)||unitPrice<0||lines.some(l=>l.item.currency!==item.currency)||lines.length>=40&&!lines.some(l=>l.key===key)){setMessage(error(""));return;}
  setLines(old=>{const found=old.find(l=>l.key===key);return found?old.map(l=>l.key===key?{...l,item,unitPrice,quantity:Math.min(1000,l.quantity+1)}:l):[...old,{key,item,options:[...selected],optionNames:groups.flatMap(g=>g.values).filter(v=>selected.includes(v.id)).map(v=>localized(v)),quantity:1,unitPrice}];});
  setQuantityDrafts({});setPending(null);setSelected([]);
 }
 async function join(){setWorking(true);try{const r=await fetch("/api/customer/join-store",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({storeSlug:slug})});if(!r.ok)throw Error();setReady(true);}catch{setMessage(error(""));}finally{setWorking(false);}}
 async function submit(){
  if(busy||!ready||!chosenBranch||!lines.length||!deliveryReady||!validDrafts)return;
  const payload={storeSlug:slug,branchId:chosenBranch,channel,currency,...(channel==="delivery"?{customerPhone:phone,deliveryAddress:address.trim()}:{}),items:lines.map(l=>({id:l.item.id,quantity:l.quantity,options:l.options}))},encoded=JSON.stringify(payload);
  setWorking(true);setMessage("");
  try{
   const signature=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(encoded)))).map(b=>b.toString(16).padStart(2,"0")).join("");
   let key=requestRef.current?.payload===signature?requestRef.current.key:crypto.randomUUID();
   try{const previous=JSON.parse(sessionStorage.getItem(storage+":request")??"null");if(previous?.payload===signature&&uuid.test(previous.key))key=previous.key;sessionStorage.setItem(storage+":request",JSON.stringify({payload:signature,key}));}catch{}
   requestRef.current={payload:signature,key};
   const r=await fetch("/api/customer/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payload,requestKey:key})}),body=await r.json();
   if(!r.ok||!body.ok)throw Error(body.code??"ORDER_UNAVAILABLE");
   if(!Number.isFinite(Number(body.total))||Number(body.total)<0||!/^[A-Z]{3}$/.test(String(body.currency)))throw Error("ORDER_UNAVAILABLE");
   requestRef.current=null;setLines([]);setQuantityDrafts({});try{sessionStorage.removeItem(storage+":request");}catch{}
   setMessage(tr("تم تسجيل الطلب. الإجمالي: ","Order placed. Total: ","Commande enregistrée. Total : ")+Number(body.total).toFixed(2)+" "+body.currency);
  }catch(e){setMessage(error(e instanceof Error?e.message:""));}finally{setWorking(false);}
 }
 if(!mounted)return <aside className="foonStorefrontCart" aria-label={title}><h2>{title}</h2></aside>;
 return <aside ref={panel} className="foonStorefrontCart" aria-label={title} aria-busy={busy}>
  <h2>{title} <span dir="ltr">({count})</span></h2>
  {message&&<p role="status">{message}</p>}
  {busy&&<p role="status">{tr("جارٍ التنفيذ…","Working…","En cours…")}</p>}
  {pending&&<section className="foonCartOptions" aria-label={tr("خيارات الصنف","Item options","Options de l’article")}><h3>{localized(pending.item)}</h3>{pending.groups.map(g=><fieldset key={g.id}><legend>{localized(g)} ({g.min}–{g.max})</legend>{g.values.map(v=><label key={v.id}><input type={g.type==="single"?"radio":"checkbox"} name={g.id} checked={selected.includes(v.id)} onChange={e=>setSelected(old=>g.type==="single"?[...old.filter(id=>!g.values.some(option=>option.id===id)),v.id]:e.target.checked?[...old,v.id]:old.filter(id=>id!==v.id))}/>{localized(v)} <span dir="ltr">{v.price.toFixed(2)} {pending.item.currency}</span></label>)}</fieldset>)}<button type="button" disabled={busy||!choicesValid(pending.groups,selected)||!variantAvailable(pending.item,selected)} onClick={add}>{tr("تأكيد الإضافة","Confirm addition","Confirmer l’ajout")}</button><button type="button" onClick={()=>setPending(null)}>{tr("إلغاء","Cancel","Annuler")}</button></section>}
  {!lines.length&&!pending&&<p>{tr("اختر من القائمة لإضافة ما تحتاجه.","Choose items from the catalog.","Choisissez des articles dans le catalogue.")}</p>}
  {lines.map(line=><div className="foonCartLine" key={line.key}><strong>{localized(line.item)}{line.optionNames.length>0&&<small style={{display:"block"}}>{line.optionNames.join(" · ")}</small>}</strong><span dir="ltr">{line.unitPrice.toFixed(2)} {line.item.currency}</span><label>{tr("الكمية","Quantity","Quantité")}{line.item.measured?" ("+line.item.unit+")":""}<input disabled={busy} type="number" dir="ltr" lang="en" inputMode={line.item.measured?"decimal":"numeric"} min={line.item.measured?0.001:1} step={line.item.measured?0.001:1} max={1000} value={quantityDrafts[line.key]??String(line.quantity)} onChange={e=>{const raw=e.target.value;setQuantityDrafts(old=>({...old,[line.key]:raw}));const value=Number(raw);if(validCatalogQuantity(value)&&(line.item.measured||Number.isInteger(value)))setLines(old=>old.map(l=>l.key===line.key?{...l,quantity:value}:l));}}/></label><button type="button" disabled={busy} onClick={()=>setLines(old=>old.filter(l=>l.key!==line.key))}>{tr("حذف","Remove","Supprimer")}</button></div>)}
  {!!lines.length&&<><p>{tr("الإجمالي التقديري","Estimated total","Total estimé")}: <strong dir="ltr">{total.toFixed(2)} {currency}</strong></p><p>{tr("تُراجع الأسعار والتوفر عند تسجيل الطلب. لا يتم الدفع إلكترونيًا.","Prices and availability are confirmed when placing the order. No online payment is taken.","Les prix et disponibilités sont confirmés à la commande. Aucun paiement en ligne n’est prélevé.")}</p><CheckoutBreakdown subtotal={total} channel={channel} policy={checkoutPolicy} currency={currency} language={language}/><label>{tr("الفرع","Branch","Succursale")}<select disabled={busy} value={chosenBranch} onChange={e=>setBranch(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>{!chosenBranch&&<p role="alert">{tr("اختر أصنافًا متاحة في فرع واحد.","Choose items available at the same branch.","Choisissez des articles disponibles dans la même succursale.")}</p>}<label>{tr("طريقة الاستلام","Fulfillment","Mode de réception")}<select disabled={busy} value={channel} onChange={e=>setChannel(e.target.value)}><option value="takeaway">{service?tr("تسليم في الفرع","Drop off at branch","Dépôt en succursale"):tr("استلام من الفرع","Store pickup","Retrait en magasin")}</option><option value="delivery">{service?tr("استلام وتوصيل","Collection and delivery","Collecte et livraison"):tr("توصيل","Delivery","Livraison")}</option></select></label>{channel==="delivery"&&<><label>{tr("رقم التواصل","Contact phone","Téléphone")}<input disabled={busy} type="tel" dir="ltr" maxLength={40} value={phone} onChange={e=>setPhone(e.target.value.replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<="٩"?1632:1776))))}/></label><label>{tr("عنوان الاستلام والتوصيل","Collection / delivery address","Adresse de collecte / livraison")}<textarea disabled={busy} maxLength={900} value={address} onChange={e=>setAddress(e.target.value)}/></label></>}{ready?<button type="button" disabled={busy||!chosenBranch||!deliveryReady||!validDrafts} onClick={()=>void submit()}>{tr("تسجيل الطلب","Place order","Commander")}</button>:signedIn?<button type="button" disabled={busy} onClick={()=>void join()}>{tr("متابعة بهذا الحساب","Continue with this account","Continuer avec ce compte")}</button>:<InlineCustomerAuth slug={slug} language={language} onSuccess={()=>{setReady(true);router.refresh();}}/>}</>}
 </aside>;
}
