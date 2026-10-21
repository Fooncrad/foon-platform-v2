"use client";
import CheckoutBreakdown from "../restaurant/checkout-breakdown";
import type {CheckoutPolicy} from "@/lib/restaurant/checkout-pricing";
import {validCatalogQuantity} from "@/lib/platform/catalog-measurements";
import {useUiText} from "@/lib/i18n/ui-language";
import {defaultPublicControls,type PublicControls} from "@/lib/tenant/public-controls-core";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {useRouter} from "next/navigation";
import InlineCustomerAuth from "./inline-customer-auth";
import {nearestDeliveryBranch} from "@/lib/tenant/nearest-delivery-branch.mjs";
import {cartKey,choicePrice,choicesValid} from "../restaurant/menu-choices";
import {validPreselectedOptions,selectedCatalogStockLimit,remainingCatalogStock,defaultCatalogAddQuantity,canAddCatalogUnit} from "@/lib/catalog/variant-selection";
import type {MenuGroup} from "@/lib/restaurant/menu";
import {supportedCountries} from "@/lib/tenant/country-catalog";
import "./storefront-cart.css";
type Language="ar"|"en"|"fr";
type PickupPoint={id:string;name:string;nameEn:string;nameFr:string;address:string;addressEn:string;addressFr:string;instructions:string;mapUrl:string};
type Item={measured?:boolean;unit?:string;stock?:number|null;variants?:{id:string;sku:string|null;options:string[];stock:number|null}[];id:string;name:string;nameEn:string;nameFr:string;price:number;currency:string;branches:{id:string;name:string}[]};
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
export function StorefrontAddButton({slug,id,language,service=false,options,disabled=false,onClick}:{slug:string;id:string;language:Language;service?:boolean;options?:string[];disabled?:boolean;onClick?:()=>void}){
 const translateUi=useUiText();

 const text=language==="ar"?(service?"إضافة الخدمة":translateUi("إضافة إلى السلة")):language==="fr"?(service?"Ajouter le service":"Ajouter au panier"):(service?"Add service":"Add to cart");
 return <button type="button" className="foonCartAdd" aria-label={text} disabled={disabled} onClick={()=>{if(disabled)return;onClick?.();window.dispatchEvent(new CustomEvent("foon:storefront-cart-add",{detail:{slug,id,options}}));}}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h2l3 11h10l3-8H6M10 20h.01M18 20h.01"/></svg><span className="foonCartAddLabel">{text}</span></button>;
}
export default function StorefrontCart({checkoutPolicy,slug,language,controls=defaultPublicControls,signedIn=false,linked=false,service=false,customerPhone="",deliveryAddress="",deliveryCity="",customerCountry="",merchantCountry="SA",deliveryCountries=["SA"]}:{checkoutPolicy?:CheckoutPolicy;slug:string;language:Language;controls?:PublicControls;signedIn?:boolean;linked?:boolean;service?:boolean;customerPhone?:string;deliveryAddress?:string;deliveryCity?:string;customerCountry?:string;merchantCountry?:string;deliveryCountries?:string[]}){
 const tr=(ar:string,en:string,fr:string)=>language==="ar"?ar:language==="fr"?fr:en;
 const title=service?tr("سلة الخدمات","Service basket","Panier de services"):tr("سلة المشتريات","Shopping cart","Panier");
 const storage="foon-public-cart:"+slug;
 const mounted=useSyncExternalStore(subscribeHydration,()=>true,()=>false);
 const [lines,setLines]=useState<Line[]>(()=>storedLines(storage)),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[ready,setReady]=useState(linked),[branch,setBranch]=useState(""),[channel,setChannel]=useState(controls.takeaway?"takeaway":controls.delivery?"delivery":""),[pickupPointId,setPickupPointId]=useState(""),[pickupResult,setPickupResult]=useState<{branchId:string;points:PickupPoint[];error:boolean}>({branchId:"",points:[],error:false});
 const router=useRouter();
 const channelAvailable=Boolean((channel==="takeaway"&&controls.takeaway)||(channel==="delivery"&&controls.delivery));
 const [enteredPhone,setPhone]=useState<string|null>(null),[enteredAddress,setAddress]=useState<string|null>(null),[deliveryCountryCode,setDeliveryCountryCode]=useState("");
 const phone=enteredPhone??customerPhone,address=enteredAddress??deliveryAddress;
 const [cityInput,setCity]=useState<string|null>(null);
 const city=cityInput??deliveryCity;
 const [addressConfirmed,setAddressConfirmed]=useState(false);
 const [geoStatus,setGeoStatus]=useState("");
 const [geoBusy,setGeoBusy]=useState(false);
 const [locationCoords,setLocationCoords]=useState<{latitude:number;longitude:number}|null>(null);
 const [savedBranches,setSavedBranches]=useState<{id:string;name:string;latitude:number|null;longitude:number|null}[]>([]);
 const [savedPreference,setSavedPreference]=useState("");
 useEffect(()=>{
  if(!ready)return;
  let live=true;
  fetch("/api/customer/delivery-preferences?storeSlug="+encodeURIComponent(slug),{cache:"no-store"})
   .then(async response=>{const data=await response.json();if(!response.ok||!data.ok)throw Error();return data;})
   .then(data=>{
    if(!live)return;
    setSavedBranches(data.branches??[]);
    if(data.address){
     if(enteredPhone===null&&data.address.phone)setPhone(String(data.address.phone));
     if(enteredAddress===null&&data.address.street)setAddress(String(data.address.street));
     if(cityInput===null&&data.address.city)setCity(String(data.address.city));
     if(data.address.latitude!=null&&data.address.longitude!=null)setLocationCoords({latitude:Number(data.address.latitude),longitude:Number(data.address.longitude)});
     if(data.address.street&&data.address.city)setAddressConfirmed(true);
     setSavedPreference(tr("تم تحميل عنوانك المحفوظ. تأكد من صحته قبل الطلب.","Your saved address was loaded. Check it before ordering.","Votre adresse enregistrée a été chargée. Vérifiez-la."));
    }
   }).catch(()=>{});
  return()=>{live=false};
 // Request is keyed by the signed-in account and store; do not override customer edits on every keystroke.
 },[ready,slug]);

 const country=deliveryCountries.includes(deliveryCountryCode)?deliveryCountryCode:(deliveryCountries.includes(customerCountry)?customerCountry:deliveryCountries.includes(merchantCountry)?merchantCountry:deliveryCountries[0]??merchantCountry);
 function captureLocation(){
  if(typeof navigator==="undefined"||!navigator.geolocation){setGeoStatus(tr("الموقع غير متاح على هذا الجهاز.","Location is not available.","Géolocalisation indisponible."));return;}
  setGeoBusy(true);setGeoStatus("");setAddressConfirmed(false);
  navigator.geolocation.getCurrentPosition(pos=>{
   const point={latitude:pos.coords.latitude,longitude:pos.coords.longitude};
   setLocationCoords(point);
   void (async()=>{
    try{
     const response=await fetch("/api/customer/reverse-geocode",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...point,storeSlug:slug,language})});
     const data=await response.json();
     if(!response.ok||!data.ok){
      if(data.code==="DELIVERY_COUNTRY_MISMATCH"){setLocationCoords(null);setGeoStatus(tr("موقعك خارج دول التوصيل المعتمدة للمتجر.","Your location is outside the store’s approved delivery countries.","Votre position est hors des pays de livraison autorisés."));return;}
      setGeoStatus(data.code==="UNAUTHENTICATED"?tr("سجّل الدخول لاستخراج العنوان تلقائيًا، أو أدخله يدويًا.","Sign in to look up your address, or enter it manually.","Connectez-vous pour trouver l’adresse, ou saisissez-la."):tr("تم التقاط الإحداثيات، لكن تعذر استخراج العنوان تلقائيًا. أدخل المدينة والعنوان يدويًا.","Location captured but address lookup is unavailable. Enter city and address manually.","Position reçue, mais adresse introuvable. Saisissez la ville et l’adresse."));
      return;
     }
     if(data.countryCode!==country){setLocationCoords(null);setGeoStatus(tr("دولة موقعك لا تطابق دولة التوصيل المختارة. راجع دولة التوصيل.","Your location does not match the selected shipping country.","Le pays de votre position ne correspond pas au pays choisi."));return;}
     setCity(String(data.city));setAddress(String(data.address));
     setGeoStatus(tr("تم إدراج المدينة والعنوان من موقعك. راجعهما ثم أكّد العنوان.","City and address filled from your location. Review and confirm them.","Ville et adresse renseignées. Vérifiez puis confirmez."));
    }catch{setGeoStatus(tr("تعذر الاتصال بخدمة العناوين. أدخل العنوان يدويًا.","Address lookup unavailable. Enter your address manually.","Service d'adresse indisponible. Saisissez l'adresse."));}
    finally{setGeoBusy(false);}
   })();
  },()=>{setGeoBusy(false);setGeoStatus(tr("تعذرت مشاركة الموقع. يمكنك كتابة العنوان.","Location permission denied. Enter your address.","Accès au GPS refusé. Saisissez votre adresse."));},{enableHighAccuracy:false,timeout:12000});
 }
 const [quantityDrafts,setQuantityDrafts]=useState<Record<string,string>>({});
 const [pending,setPending]=useState<{item:Item;groups:MenuGroup[]}|null>(null),[selected,setSelected]=useState<string[]>([]);
 const busyRef=useRef(false);
 function setWorking(value:boolean){busyRef.current=value;setBusy(value);}
 const requestRef=useRef<{payload:string;key:string}|null>(null);
 const panel=useRef<HTMLElement>(null);
 const localized=(item:{name:string;nameEn?:string;nameFr?:string})=>language==="en"?item.nameEn||item.name:language==="fr"?item.nameFr||item.name:item.name;
 const error=(code:string)=>code==="STORE_CUSTOMER_REQUIRED"?tr("اربط حسابك بهذا المتجر أولاً من زر المتابعة، ثم أعد الطلب.","Link your account to this store using Continue, then retry checkout.","Associez votre compte à cette boutique puis réessayez."):code==="UNAUTHENTICATED"?tr("سجّل الدخول أولاً لإكمال الطلب وحفظه في سجل حسابك.","Sign in first to save this order to your account history.","Connectez-vous pour enregistrer cette commande dans votre historique."):code==="DELIVERY_DETAILS_REQUIRED"?tr("للتوصيل أدخل رقم جوال صحيحًا والمدينة والعنوان وأكّدها.","For delivery, enter a valid phone, city and address, then confirm.","Indiquez un téléphone, une ville et une adresse valides puis confirmez."):code==="STORE_CLOSED"||code==="ORDERS_DISABLED"||code==="ORDER_CHANNEL_DISABLED"?tr("الفرع لا يستقبل هذه الطلبات حاليًا. اختر قناة متاحة أو حاول في وقت العمل.","This branch is not accepting this order type now. Choose another method or try during opening hours.","Cette succursale ne reçoit pas ce type de commande actuellement."):code==="DELIVERY_GPS_REQUIRED"?tr("هذا المتجر يحدد التوصيل بنصف القطر. شارك موقعك بالزر ثم راجع العنوان.","This store requires GPS coordinates for radius-based delivery. Tap use my location, then confirm your address.","Cette boutique exige votre position GPS pour une livraison dans un rayon."):code==="DELIVERY_OUT_OF_RANGE"?tr("موقعك خارج نطاق توصيل المتجر المحدد، اختر الاستلام أو تواصل مع المتجر.","Your location is outside this store’s delivery radius. Select pickup or contact the store.","Votre position est hors de la zone de livraison."):code==="DELIVERY_COUNTRY_MISMATCH"?tr("عنوان التوصيل يجب أن يكون في دولة هذا المتجر. غيّر دولة العنوان أو اختر متجرًا محليًا.","Delivery must be within this store’s country. Change the delivery country or choose a local store.","La livraison doit rester dans le pays de cette boutique. Modifiez le pays ou choisissez une boutique locale."):code==="INSUFFICIENT_STOCK"?tr("الكمية المطلوبة غير متاحة. عدّل السلة.","Requested quantity is unavailable. Update your cart.","Quantité indisponible. Modifiez le panier."):code==="INVALID_OPTIONS"?tr("راجع خيارات الأصناف وأضفها مجددًا.","Review item options and add them again.","Vérifiez les options et ajoutez à nouveau les articles."):code==="DELIVERY_DRIVER_UNAVAILABLE"?tr("لا يمكن تنفيذ طلب التوصيل حاليًا لعدم توفر سائق معيّن لهذا المتجر. اختر الاستلام من الفرع أو حاول لاحقًا.","Delivery is unavailable because this store has no assigned driver available. Choose store pickup or try again later.","La livraison est indisponible, car aucun livreur n’est disponible pour cette boutique. Choisissez le retrait en magasin ou réessayez plus tard."):tr("تعذر إكمال العملية. راجع البيانات وحاول مجددًا.","Unable to continue. Check the details and try again.","Impossible de continuer. Vérifiez les informations et réessayez.");
 useEffect(()=>{if(mounted)try{sessionStorage.setItem(storage,JSON.stringify(lines));}catch{}},[lines,mounted,storage]);
 useEffect(()=>{
  let active=true;
  const handler=async(event:Event)=>{
   const detail=(event as CustomEvent<{slug?:string;id?:string;options?:unknown}>).detail;
   if(detail?.slug!==slug||typeof detail.id!=="string"||!uuid.test(detail.id))return;
   if(busyRef.current)return;
   setWorking(true);setMessage("");
   try{
    const r=await fetch("/api/customer/cart?store="+encodeURIComponent(slug)+"&product="+encodeURIComponent(detail.id),{cache:"no-store"}),body=await r.json();
    if(!r.ok||!body.ok)throw Error(body.code??"CART_UNAVAILABLE");
    if(active){setPending({item:body.item,groups:body.groups});setSelected(validPreselectedOptions(detail.options,body.groups,body.item.variants??[]));panel.current?.scrollIntoView({block:"nearest"});}
   }catch(e){if(active)setMessage(error(e instanceof Error?e.message:""));}finally{if(active)setWorking(false);}
  };
  window.addEventListener("foon:storefront-cart-add",handler);return()=>{active=false;window.removeEventListener("foon:storefront-cart-add",handler);};
 // Messages follow the server-rendered storefront locale.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[slug,language]);
 const branches=lines.length?lines[0].item.branches.filter(b=>lines.every(line=>line.item.branches.some(option=>option.id===b.id))):[];
 const suggested=nearestDeliveryBranch(savedBranches,locationCoords,branches.map(b=>b.id));
 const suggestedBranchId=channel==="delivery"&&suggested&&!suggested.approximate?suggested.branch.id:"";
 const chosenBranch=branches.some(b=>b.id===branch)?branch:(suggestedBranchId||branches[0]?.id||"");
 useEffect(()=>{if(!chosenBranch)return;let active=true;fetch("/api/customer/pickup-points?storeSlug="+encodeURIComponent(slug)+"&branchId="+encodeURIComponent(chosenBranch),{cache:"no-store"}).then(async response=>{const body=await response.json();if(!response.ok||!body.ok||!Array.isArray(body.points))throw Error();if(active)setPickupResult({branchId:chosenBranch,points:body.points as PickupPoint[],error:false});}).catch(()=>{if(active)setPickupResult({branchId:chosenBranch,points:[],error:true});});return()=>{active=false;};},[chosenBranch,slug]);
 const pickupPoints=pickupResult.branchId===chosenBranch?pickupResult.points:[],pickupPointsLoading=Boolean(chosenBranch)&&pickupResult.branchId!==chosenBranch,pickupPointsError=pickupResult.branchId===chosenBranch&&pickupResult.error,effectivePickupPointId=pickupPoints.some(point=>point.id===pickupPointId)?pickupPointId:"";
 const currency=lines[0]?.item.currency??pending?.item.currency??"";
 const deliveryReady=channel!=="delivery"||(deliveryCountries.includes(country)&&city.trim().length>=2&&addressConfirmed&&/^\+?[\d ()-]{7,40}$/.test(phone)&&phone.replace(/\D/g,"").length>=7&&address.trim().length>=5&&address.length<=900);
 const validDrafts=lines.every(line=>quantityDrafts[line.key]===undefined||(validCatalogQuantity(Number(quantityDrafts[line.key]))&&(line.item.measured||Number.isInteger(Number(quantityDrafts[line.key])))));
 const total=lines.reduce((sum,line)=>sum+Math.round(Math.round(line.unitPrice*100)*Math.round(line.quantity*1000)/1000)/100,0),count=lines.reduce((sum,line)=>sum+line.quantity,0);
 function variantAvailable(item:Item,groups:MenuGroup[],ids:string[]){const stock=selectedCatalogStockLimit(groups,item.variants??[],ids,item.stock??null);return stock===null||stock>=(item.measured?0.001:1);}
 function add(){
  if(!pending||!choicesValid(pending.groups,selected))return;
   const existing=lines.filter(line=>line.item.id===pending.item.id).map(line=>({options:line.options,quantity:line.quantity}));
   const remaining=remainingCatalogStock(pending.groups,pending.item.variants??[],selected,pending.item.stock??null,existing);
   const initialQuantity=defaultCatalogAddQuantity(Boolean(pending.item.measured),remaining);
   if(initialQuantity<=0||!canAddCatalogUnit(pending.groups,pending.item.variants??[],selected,pending.item.stock??null,existing,initialQuantity)){setMessage(error("INSUFFICIENT_STOCK"));return;}
  const {item,groups}=pending,key=cartKey(item.id,selected),unitPrice=item.price+choicePrice(groups,selected);
  if(!Number.isFinite(unitPrice)||unitPrice<0||lines.some(l=>l.item.currency!==item.currency)||lines.length>=40&&!lines.some(l=>l.key===key)){setMessage(error(""));return;}
  setLines(old=>{const found=old.find(l=>l.key===key);return found?old.map(l=>l.key===key?{...l,item,unitPrice,quantity:Math.min(1000,l.quantity+initialQuantity)}:l):[...old,{key,item,options:[...selected],optionNames:groups.flatMap(g=>g.values).filter(v=>selected.includes(v.id)).map(v=>localized(v)),quantity:initialQuantity,unitPrice}];});
  setQuantityDrafts({});setPending(null);setSelected([]);
 }
 async function join(){setWorking(true);try{const r=await fetch("/api/customer/join-store",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({storeSlug:slug})});if(!r.ok)throw Error();setReady(true);}catch{setMessage(error(""));}finally{setWorking(false);}}
 async function submit(){if(!channelAvailable){setMessage(tr("قناة الطلب متوقفة مؤقتًا.","This order channel is unavailable.","Ce mode de commande est indisponible."));return;}
  if(busy||geoBusy||!ready||!chosenBranch||!lines.length||!deliveryReady||!validDrafts||channel==="takeaway"&&(pickupPointsLoading||pickupPointsError||pickupPoints.length>0&&!effectivePickupPointId))return;
  const payload={storeSlug:slug,branchId:chosenBranch,channel,currency,...(channel==="takeaway"&&effectivePickupPointId?{pickupPointId:effectivePickupPointId}:{}),...(channel==="delivery"?{customerPhone:phone,deliveryCountryCode:country,deliveryCity:city.trim(),deliveryAddress:address.trim(),...(locationCoords??{})}:{}),items:lines.map(l=>({id:l.item.id,quantity:l.quantity,options:l.options}))},encoded=JSON.stringify(payload);
  setWorking(true);setMessage("");
  try{
   const signature=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(encoded)))).map(b=>b.toString(16).padStart(2,"0")).join("");
   let key=requestRef.current?.payload===signature?requestRef.current.key:crypto.randomUUID();
   try{const previous=JSON.parse(sessionStorage.getItem(storage+":request")??"null");if(previous?.payload===signature&&uuid.test(previous.key))key=previous.key;sessionStorage.setItem(storage+":request",JSON.stringify({payload:signature,key}));}catch{}
   requestRef.current={payload:signature,key};
   const r=await fetch("/api/customer/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payload,requestKey:key})}),body=await r.json();
   if(!r.ok||!body.ok){if(body.code==="STORE_CUSTOMER_REQUIRED"||body.code==="UNAUTHENTICATED")setReady(false);if(body.code==="DELIVERY_OUT_OF_RANGE"&&typeof body.message==="string"&&body.message.length<=240){setMessage(body.message);return;}throw Error(body.code??"ORDER_UNAVAILABLE");}
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
  {pending&&<section className="foonCartOptions" aria-label={tr("خيارات الصنف","Item options","Options de l’article")}><h3>{localized(pending.item)}</h3>{pending.groups.map(g=><fieldset key={g.id}><legend>{localized(g)} ({g.min}–{g.max})</legend>{g.values.map(v=><label key={v.id}><input type={g.type==="single"?"radio":"checkbox"} name={g.id} disabled={v.stock!==undefined&&v.stock!==null&&v.stock<=0&&!selected.includes(v.id)} checked={selected.includes(v.id)} onChange={e=>setSelected(old=>g.type==="single"?[...old.filter(id=>!g.values.some(option=>option.id===id)),v.id]:e.target.checked?[...old,v.id]:old.filter(id=>id!==v.id))}/>{localized(v)} <span dir="ltr">{v.price.toFixed(2)} {pending.item.currency}</span></label>)}</fieldset>)}<button type="button" disabled={busy||!choicesValid(pending.groups,selected)||!variantAvailable(pending.item,pending.groups,selected)||!canAddCatalogUnit(pending.groups,pending.item.variants??[],selected,pending.item.stock??null,lines.filter(l=>l.item.id===pending.item.id).map(l=>({options:l.options,quantity:l.quantity})),defaultCatalogAddQuantity(Boolean(pending.item.measured),remainingCatalogStock(pending.groups,pending.item.variants??[],selected,pending.item.stock??null,lines.filter(l=>l.item.id===pending.item.id).map(l=>({options:l.options,quantity:l.quantity})))))} onClick={add}>{tr("تأكيد الإضافة","Confirm addition","Confirmer l’ajout")}</button><button type="button" onClick={()=>setPending(null)}>{tr("إلغاء","Cancel","Annuler")}</button></section>}
  {!lines.length&&!pending&&<p>{tr("اختر من القائمة لإضافة ما تحتاجه.","Choose items from the catalog.","Choisissez des articles dans le catalogue.")}</p>}
  {lines.map(line=><div className="foonCartLine" key={line.key}><strong>{localized(line.item)}{line.optionNames.length>0&&<small style={{display:"block"}}>{line.optionNames.join(" · ")}</small>}</strong><span dir="ltr">{line.unitPrice.toFixed(2)} {line.item.currency}</span><label>{tr("الكمية","Quantity","Quantité")}{line.item.measured?" ("+line.item.unit+")":""}<input disabled={busy} type="number" dir="ltr" lang="en" inputMode={line.item.measured?"decimal":"numeric"} min={line.item.measured?0.001:1} step={line.item.measured?0.001:1} max={1000} value={quantityDrafts[line.key]??String(line.quantity)} onChange={e=>{const raw=e.target.value;setQuantityDrafts(old=>({...old,[line.key]:raw}));const value=Number(raw);if(validCatalogQuantity(value)&&(line.item.measured||Number.isInteger(value)))setLines(old=>old.map(l=>l.key===line.key?{...l,quantity:value}:l));}}/></label><button type="button" disabled={busy} onClick={()=>setLines(old=>old.filter(l=>l.key!==line.key))}>{tr("حذف","Remove","Supprimer")}</button></div>)}
  {!!lines.length&&<><p>{tr("الإجمالي التقديري","Estimated total","Total estimé")}: <strong dir="ltr">{total.toFixed(2)} {currency}</strong></p><p>{tr("تُراجع الأسعار والتوفر عند تسجيل الطلب. لا يتم الدفع إلكترونيًا.","Prices and availability are confirmed when placing the order. No online payment is taken.","Les prix et disponibilités sont confirmés à la commande. Aucun paiement en ligne n’est prélevé.")}</p><CheckoutBreakdown subtotal={total} channel={channel} policy={checkoutPolicy} currency={currency} language={language}/><label>{tr("الفرع","Branch","Succursale")}<select disabled={busy} value={chosenBranch} onChange={e=>setBranch(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>{channel==="delivery"&&suggestedBranchId&&<p role="status">{tr("الفرع الأقرب لعنوانك المحفوظ: ","Closest branch to your saved location: ","Succursale la plus proche : ")}{branches.find(b=>b.id===suggestedBranchId)?.name} {suggested?.distanceKm!=null?"("+suggested.distanceKm.toFixed(1)+" km)":""}</p>}{!chosenBranch&&<p role="alert">{tr("اختر أصنافًا متاحة في فرع واحد.","Choose items available at the same branch.","Choisissez des articles disponibles dans la même succursale.")}</p>}<label>{tr("طريقة الاستلام","Fulfillment","Mode de réception")}<select disabled={busy} value={channel} onChange={e=>setChannel(e.target.value)}>{controls.takeaway&&<option value="takeaway">{service?tr("تسليم في الفرع","Drop off at branch","Dépôt en succursale"):tr("استلام من الفرع","Store pickup","Retrait en magasin")}</option>}{controls.delivery&&<option value="delivery">{service?tr("استلام وتوصيل","Collection and delivery","Collecte et livraison"):tr("توصيل","Delivery","Livraison")}</option>}</select></label>{!channelAvailable&&<p role="status">{tr("جميع قنوات الطلب متوقفة مؤقتًا.","Order channels are unavailable.","Les modes de commande sont indisponibles.")}</p>}{channel==="takeaway"&&pickupPointsLoading&&<p role="status">{tr("جارٍ تحميل نقاط الاستلام…","Loading pickup points…","Chargement des points de retrait…")}</p>}{channel==="takeaway"&&pickupPointsError&&<p role="alert">{tr("تعذر تحميل نقاط الاستلام. أعد المحاولة.","Pickup points could not be loaded. Try again.","Impossible de charger les points de retrait. Réessayez.")}</p>}{channel==="takeaway"&&pickupPoints.length>0&&<><label>{tr("نقطة الاستلام","Pickup point","Point de retrait")}<select disabled={busy||pickupPointsLoading} value={effectivePickupPointId} onChange={e=>setPickupPointId(e.target.value)}><option value="">{tr("اختر نقطة الاستلام","Choose a pickup point","Choisir un point de retrait")}</option>{pickupPoints.map(point=><option key={point.id} value={point.id}>{language==="en"?point.nameEn||point.name:language==="fr"?point.nameFr||point.name:point.name} — {language==="en"?point.addressEn||point.address:language==="fr"?point.addressFr||point.address:point.address}</option>)}</select></label>{pickupPoints.find(point=>point.id===effectivePickupPointId)?.instructions&&<p>{pickupPoints.find(point=>point.id===effectivePickupPointId)?.instructions}</p>}{pickupPoints.find(point=>point.id===effectivePickupPointId)?.mapUrl&&<a href={pickupPoints.find(point=>point.id===effectivePickupPointId)?.mapUrl} target="_blank" rel="noreferrer">{tr("فتح الموقع على الخريطة","Open map location","Ouvrir l’emplacement sur la carte")}</a>}</>}{channel==="delivery"&&<><label>{tr("رقم التواصل","Contact phone","Téléphone")}<input disabled={busy} type="tel" dir="ltr" maxLength={40} value={phone} onChange={e=>setPhone(e.target.value.replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<="٩"?1632:1776))))}/></label>{deliveryCountries.length>1?<label>{tr("دولة الشحن","Shipping country","Pays de livraison")}<select disabled={busy||geoBusy} value={country} onChange={e=>{setDeliveryCountryCode(e.target.value);setCity("");setAddress("");setLocationCoords(null);setAddressConfirmed(false)}}>{deliveryCountries.map(code=><option key={code} value={code}>{supportedCountries.find(item=>item.code===code)?.[language]??code}</option>)}</select></label>:<p>{tr("دولة المتجر","Store country","Pays du magasin")}: {supportedCountries.find(item=>item.code===country)?.[language]??country}</p>}<label>{tr("المدينة","City","Ville")}<input disabled={busy||geoBusy} required maxLength={120} value={city} onChange={e=>{setCity(e.target.value);setLocationCoords(null);setAddressConfirmed(false)}}/></label><label>{tr("عنوان الاستلام والتوصيل","Collection / delivery address","Adresse de collecte / livraison")}<textarea disabled={busy||geoBusy} maxLength={900} value={address} onChange={e=>{setAddress(e.target.value);setLocationCoords(null);setAddressConfirmed(false)}}/></label><button type="button" disabled={busy||geoBusy} onClick={captureLocation}>{tr("مزامنة موقعي","Use my location","Utiliser ma position")}</button>{geoStatus&&<p role="status">{geoStatus}</p>}{savedPreference&&<p role="status">{savedPreference}</p>}<label><input type="checkbox" checked={addressConfirmed} onChange={e=>setAddressConfirmed(e.target.checked)}/>{tr("أؤكد أن عنوان التوصيل صحيح","I confirm this delivery address","Je confirme cette adresse")}</label></>}{ready?<button type="button" disabled={busy||geoBusy||!chosenBranch||!deliveryReady||!validDrafts||channel==="takeaway"&&(pickupPointsLoading||pickupPointsError||pickupPoints.length>0&&!effectivePickupPointId)} onClick={()=>void submit()}>{tr("تسجيل الطلب","Place order","Commander")}</button>:signedIn?<button type="button" disabled={busy} onClick={()=>void join()}>{tr("متابعة بهذا الحساب","Continue with this account","Continuer avec ce compte")}</button>:controls.customerLogin?<InlineCustomerAuth slug={slug} language={language} onSuccess={()=>{setReady(true);router.refresh();}}/>:<p>{tr("دخول العملاء متوقف مؤقتًا.","Customer login is temporarily disabled.","Connexion client désactivée temporairement.")}</p>}</>}
 </aside>;
}
