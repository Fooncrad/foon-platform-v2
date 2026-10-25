"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {publicStorefrontUrl} from "@/lib/tenant/workspace-routes";
type Store={id:string;name:string;slug:string;orderCount:number};
type Language="ar"|"en"|"fr";
const labels={
 ar:{title:"متاجري المفضلة",subtitle:"ثبّت المتاجر التي تعود إليها كثيرًا، وابحث عنها واطلب مجددًا بسهولة.",search:"بحث باسم المتجر",save:"تثبيت",remove:"إزالة التثبيت",open:"زيارة المتجر",count:"طلبات سابقة",empty:"لا توجد متاجر مرتبطة بحسابك بعد.",noResults:"لا توجد متاجر مطابقة للبحث.",failed:"تعذر تحديث المفضلة؛ حاول مجددًا.",unavailable:"المفضلة غير متاحة حاليًا.",privacy:"المفضلة خاصة بحسابك، ولا تظهر للمتاجر أو على بروفايلك العام.",saved:"تم تحديث المفضلة.",badge:"مفضل"},
 en:{title:"My favorite stores",subtitle:"Pin your regular stores, search and return to shop again.",search:"Search stores",save:"Pin store",remove:"Unpin",open:"Visit store",count:"Previous orders",empty:"No linked stores yet.",noResults:"No stores match your search.",failed:"Could not update favorites. Try again.",unavailable:"Favorites are unavailable.",privacy:"Only you can view this list; stores and public profiles cannot see your favorites.",saved:"Favorites updated.",badge:"Favorite"},
 fr:{title:"Mes boutiques favorites",subtitle:"Épinglez vos boutiques habituelles et retrouvez-les rapidement.",search:"Rechercher une boutique",save:"Épingler",remove:"Retirer",open:"Visiter la boutique",count:"Commandes précédentes",empty:"Aucune boutique liée pour le moment.",noResults:"Aucune boutique trouvée.",failed:"Impossible de modifier les favoris. Réessayez.",unavailable:"Favoris indisponibles.",privacy:"Vous seul voyez vos favoris ; ils ne figurent pas sur votre profil public.",saved:"Favoris mis à jour.",badge:"Favori"}
} as const;
export default function CustomerFavoriteStores({language,stores}:{language:Language;stores:Store[]}){
 const t=labels[language];
 const [selected,setSelected]=useState<string[]>([]),[search,setSearch]=useState(""),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[ready,setReady]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch("/api/customer/favorite-stores",{cache:"no-store",signal:controller.signal})
   .then(async response=>{const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok||!Array.isArray(body.tenantIds))throw Error("FAVORITES_UNAVAILABLE");return body.tenantIds as string[];})
   .then(ids=>{if(!controller.signal.aborted){setSelected(ids);setReady(true);}})
   .catch(()=>{if(!controller.signal.aborted){setError(labels[language].unavailable);setReady(true);}});
  return()=>controller.abort();
 },[language]);
 const matches=useMemo(()=>stores.filter(s=>s.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a,b)=>Number(selected.includes(b.id))-Number(selected.includes(a.id))||b.orderCount-a.orderCount||a.name.localeCompare(b.name)),[stores,selected,search]);
 async function toggle(id:string){
  if(busy||!ready)return;
  const wasSelected=selected.includes(id);setBusy(id);setError("");setMessage("");
  try{
   const response=await fetch("/api/customer/favorite-stores",{method:wasSelected?"DELETE":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tenantId:id})});
   const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw Error("UPDATE_FAILED");
   setSelected(previous=>wasSelected?previous.filter(x=>x!==id):previous.includes(id)?previous:[...previous,id]);setMessage(t.saved);
  }catch{setError(t.failed);}finally{setBusy(null);}
 }
 return <section className="customerPortalDetails customerFavoriteStores" id="customer-stores" aria-labelledby="favorite-stores-title">
  <header><div><small>FOON FAVORITES</small><h2 id="favorite-stores-title">{t.title}</h2><p>{t.subtitle}</p></div><strong dir="ltr">{selected.filter(id=>stores.some(s=>s.id===id)).length.toLocaleString("en-US")} ★</strong></header>
  <label className="customerFavoriteSearch"><span>{t.search}</span><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder={t.search}/></label>
  {!ready&&<p role="status">{language==="ar"?"جارٍ تحميل المفضلة...":language==="en"?"Loading favorites...":"Chargement des favoris..."}</p>}
  {stores.length===0?<p>{t.empty}</p>:<div className="customerFavoriteGrid">{matches.map(store=>{const saved=selected.includes(store.id);return <article key={store.id} className="customerFavoriteCard" data-favorite={saved}>
    <div className="customerFavoriteCardHead"><strong>{store.name}</strong>{saved&&<span className="customerFavoriteMark">{t.badge}</span>}</div>
    {store.orderCount>0&&<small>{t.count}: <b dir="ltr">{store.orderCount.toLocaleString("en-US")}</b></small>}
    <div className="customerFavoriteActions"><Link href={publicStorefrontUrl(store.slug)}>{t.open}</Link><button type="button" disabled={!ready||Boolean(busy)} aria-pressed={saved} onClick={()=>void toggle(store.id)}>{saved?"★":"☆"} {saved?t.remove:t.save}</button></div>
   </article>})}</div>}
  {stores.length>0&&matches.length===0&&<p>{t.noResults}</p>}
  <p className="customerFavoritePrivacy">{t.privacy}</p>{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
