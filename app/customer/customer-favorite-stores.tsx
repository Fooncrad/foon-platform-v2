"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {publicStorefrontUrl} from "@/lib/tenant/workspace-routes";

type Lang="ar"|"en"|"fr";
type LinkedStore={id:string;name:string;slug:string;orderCount:number};
export default function CustomerFavoriteStores({language,stores}:{language:Lang;stores:LinkedStore[]}){
 const t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const [favorites,setFavorites]=useState<string[]>([]);
 const [search,setSearch]=useState("");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState(""),[message,setMessage]=useState("");
 useEffect(()=>{
  const controller=new AbortController();
  void fetch("/api/customer/favorite-stores",{cache:"no-store",signal:controller.signal})
   .then(async r=>{const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok||!Array.isArray(d.storeIds))throw Error("LOAD_FAILED");return d;})
   .then(d=>{if(!controller.signal.aborted){setFavorites(d.storeIds.filter((id:unknown):id is string=>typeof id==="string"));setLoading(false);}})
   .catch(()=>{if(!controller.signal.aborted){setError(language==="en"?"Could not load favorite stores.":language==="fr"?"Impossible de charger les favoris.":"تعذر تحميل المتاجر المفضلة.");setLoading(false);}});
  return()=>controller.abort();
 },[language]);
 const sorted=useMemo(()=>stores.filter(s=>s.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a,b)=>Number(favorites.includes(b.id))-Number(favorites.includes(a.id))||b.orderCount-a.orderCount||a.name.localeCompare(b.name)),[stores,favorites,search]);
 async function toggle(id:string){
  if(busy||loading)return;
  const saved=favorites.includes(id);
  setBusy(id);setError("");setMessage("");
  try{
   const r=await fetch("/api/customer/favorite-stores",{method:saved?"DELETE":"POST",headers:{"content-type":"application/json"},body:JSON.stringify({storeId:id})});
   const data=await r.json().catch(()=>null);if(!r.ok||!data?.ok)throw Error(String(data?.code??"FAILED"));
   setFavorites(current=>saved?current.filter(item=>item!==id):current.includes(id)?current:[id,...current]);
   setMessage(saved?t("أُزيل المتجر من المفضلة.","Store removed from favorites.","Boutique retirée des favoris."):t("تم تثبيت المتجر في المفضلة.","Store added to favorites.","Boutique ajoutée aux favoris."));
  }catch{setError(t("تعذر حفظ اختيارك. حاول مجددًا.","Could not save your choice. Try again.","Impossible d’enregistrer le choix. Réessayez."));}
  finally{setBusy(null);}
 }
 return <article id="customer-stores" className="customerFavoriteStores" aria-labelledby="customer-favorites-title">
  <header><div><small>FOON SHORTCUTS</small><h2 id="customer-favorites-title">{t("متاجري المفضلة","My favorite stores","Mes boutiques favorites")}</h2><p>{t("ثبّت المتاجر التي تعود إليها كثيرًا، وابدأ التسوق دون البحث عنها كل مرة.","Pin stores you return to often and shop again without searching.","Épinglez les boutiques habituelles pour les retrouver rapidement.")}</p></div><strong dir="ltr">{favorites.length.toLocaleString("en-US")} ★</strong></header>
  <label className="customerFavoriteSearch"><span>{t("ابحث في المتاجر المرتبطة بحسابك","Search stores linked to your account","Rechercher parmi vos boutiques")}</span><input value={search} onChange={v=>setSearch(v.target.value)} type="search" placeholder={t("اسم المتجر","Store name","Nom de boutique")} /></label>
  {loading&&<p role="status">{t("جارٍ تحميل المفضلة...","Loading favorites...","Chargement des favoris...")}</p>}
  <div className="customerFavoriteGrid">{sorted.map(store=>{const saved=favorites.includes(store.id);return <section key={store.id} className="customerFavoriteCard" data-favorite={saved}>
   <div className="customerFavoriteCardHead"><strong>{store.name}</strong>{saved&&<span className="customerFavoriteMark">{t("مفضل","Favorite","Favori")}</span>}</div>
   <small>{store.orderCount>0?t("طلبات سابقة: ","Previous orders: ","Commandes précédentes : ")+store.orderCount.toLocaleString("en-US"):t("متجر مرتبط بحسابك","Linked store","Boutique associée")}</small>
   <div className="customerFavoriteActions"><Link href={publicStorefrontUrl(store.slug)}>{t("زيارة المتجر","Visit store","Visiter")}</Link><button type="button" disabled={loading||busy!==null} aria-pressed={saved} aria-label={saved?t("إزالة ","Remove ","Retirer ")+store.name:t("إضافة ","Save ","Ajouter ")+store.name} onClick={()=>void toggle(store.id)}>{saved?t("★ إزالة التثبيت","★ Unpin","★ Retirer"):t("☆ تثبيت","☆ Save","☆ Épingler")}</button></div>
  </section>;})}</div>
  {!sorted.length&&<p className="customerFavoriteEmpty">{t("لا توجد متاجر مطابقة. امسح البحث لعرض بقية المتاجر.","No matching stores. Clear the search.","Aucune boutique correspondante. Effacez la recherche.")}</p>}
  <p className="customerFavoritePrivacy">{t("المفضلة خاصة بحسابك، ولا تُعرض لصاحب المتجر أو على البروفايل العام. يمكنك إلغاء التثبيت في أي وقت.","Favorites are private to you; merchants and public profiles cannot see this list. You can unpin anytime.","Vos favoris sont privés et invisibles aux commerçants et au public. Vous pouvez les retirer à tout moment.")}</p>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </article>;
}
