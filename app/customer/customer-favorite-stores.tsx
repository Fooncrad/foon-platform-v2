"use client";
import {useEffect,useState} from "react";
type Store={id:string;name:string};
type Language="ar"|"en"|"fr";
const labels={
 ar:{title:"متاجري المفضلة",save:"حفظ في المفضلة",remove:"إزالة من المفضلة",empty:"لا توجد متاجر مرتبطة بحسابك بعد.",failed:"تعذر تحديث المفضلة. حاول مجددًا.",unavailable:"المفضلة غير متاحة حاليًا."},
 en:{title:"Favorite stores",save:"Save favorite",remove:"Remove favorite",empty:"No linked stores yet.",failed:"Could not update favorites. Try again.",unavailable:"Favorites are unavailable right now."},
 fr:{title:"Mes boutiques favorites",save:"Ajouter aux favoris",remove:"Retirer des favoris",empty:"Aucune boutique liée pour le moment.",failed:"Impossible de modifier les favoris. Réessayez.",unavailable:"Les favoris sont indisponibles pour le moment."}
} as const;
export default function CustomerFavoriteStores({language,stores}:{language:Language;stores:Store[]}){
 const [selected,setSelected]=useState<string[]>([]);
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [ready,setReady]=useState(false);
 const t=labels[language];
 useEffect(()=>{let cancelled=false;fetch("/api/customer/favorite-stores",{cache:"no-store"}).then(async response=>{if(!response.ok)throw Error("unavailable");return response.json();}).then(body=>{if(!cancelled)setSelected(Array.isArray(body.tenantIds)?body.tenantIds:[]);}).catch(()=>{if(!cancelled)setError(t.unavailable);}).finally(()=>{if(!cancelled)setReady(true);});return ()=>{cancelled=true};},[t.unavailable]);
 async function toggle(id:string){
  if(busy)return;setBusy(id);setError("");const exists=selected.includes(id);
  try{const response=await fetch("/api/customer/favorite-stores",{method:exists?"DELETE":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tenantId:id})});if(!response.ok)throw Error("request-failed");setSelected(previous=>exists?previous.filter(x=>x!==id):[...previous,id]);}catch{setError(t.failed);}finally{setBusy(null);}
 }
 return <section className="customerPortalDetails" aria-labelledby="favorite-stores-title"><h2 id="favorite-stores-title">{t.title}</h2>
 {error&&<p role="alert">{error}</p>}
 {stores.length===0?<p>{t.empty}</p>:<div className="customerGrowthStores">{stores.map(store=><button type="button" key={store.id} disabled={!ready||Boolean(busy)} aria-pressed={selected.includes(store.id)} onClick={()=>void toggle(store.id)}>{selected.includes(store.id)?"♥":"♡"} {store.name} — {selected.includes(store.id)?t.remove:t.save}</button>)}</div>}
 </section>;
}
