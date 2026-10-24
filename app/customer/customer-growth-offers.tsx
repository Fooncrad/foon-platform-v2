"use client";
import {useEffect,useState} from "react";
type Locale="ar"|"en"|"fr";
type Campaign={id:string;kind:string;title_ar:string;title_en:string|null;title_fr:string|null;discount_type:"fixed"|"percent";discount_value:number|string;currency:string;minimum_spend:number|string;ends_at:string};
const labels={ar:{heading:"عروض متاجري",empty:"لا توجد عروض متاحة حاليًا.",note:"الخصم يخضع للتحقق النهائي عند إتمام الطلب ولا يطبق تلقائيًا من هذه الصفحة.",error:"تعذر تحميل العروض."},en:{heading:"Offers from my stores",empty:"No offers currently available.",note:"Discount eligibility is checked at checkout. Viewing an offer does not apply it.",error:"Unable to load offers."},fr:{heading:"Offres de mes boutiques",empty:"Aucune offre disponible.",note:"L’éligibilité est vérifiée lors du paiement. L’affichage n’applique pas la réduction.",error:"Impossible de charger les offres."}} as const;
export default function CustomerGrowthOffers({language,stores}:{language:Locale;stores:{id:string;name:string}[]}){
 const [offers,setOffers]=useState<{store:string;offer:Campaign}[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 useEffect(()=>{let cancelled=false;async function load(){try{
 const selected=stores.slice(0,10);
 const results=await Promise.all(selected.map(async s=>{const response=await fetch("/api/customer/growth-offers?tenantId="+encodeURIComponent(s.id),{cache:"no-store"});if(!response.ok)throw Error("offers");const data=await response.json();return (Array.isArray(data.campaigns)?data.campaigns:[]).map((offer:Campaign)=>({store:s.name,offer}));}));
 if(!cancelled)setOffers(results.flat().slice(0,20));
 }catch{if(!cancelled)setError(true);}finally{if(!cancelled)setLoading(false);}}
 void load();return()=>{cancelled=true};},[stores]);
 const t=labels[language];
 return <section className="customerPortalDetails" aria-labelledby="customer-offers-title"><h2 id="customer-offers-title">{t.heading}</h2>{loading?<p aria-live="polite">…</p>:error?<p role="alert">{t.error}</p>:offers.length===0?<p>{t.empty}</p>:<div className="customerGrowthStores">{offers.map(({store,offer})=><article key={offer.id} className="customerGrowthOffer"><strong>{language==="fr"?(offer.title_fr||offer.title_ar):language==="en"?(offer.title_en||offer.title_ar):offer.title_ar}</strong><small>{store}</small><span>{Number(offer.discount_value).toFixed(offer.discount_type==="percent"?0:2)} {offer.discount_type==="percent"?"%":offer.currency}</span></article>)}</div>}<p className="customerGrowthHint">{t.note}</p></section>;
}
