"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
type Place={id:string;lat:number|null;lng:number|null};
const rad=(n:number)=>n*Math.PI/180;
export function distanceKm(a:number,b:number,c:number,d:number){const x=Math.sin(rad(c-a)/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
export default function MarketPersonalTools({places,locale}:{places:Place[];locale:"ar"|"en"|"fr"}){
 const router=useRouter();
 const [favoriteIds,setFavorites]=useState<string[]>([]);
 const [signedIn,setSignedIn]=useState(false);
 const [notice,setNotice]=useState("");
 const [pending,setPending]=useState<string|null>(null);
 const [position,setPosition]=useState<{lat:number;lng:number}|null>(null);
 const t={ar:{near:"الأقرب لموقعي",locating:"جار تحديد الموقع",denied:"الموقع غير متاح أو لم تمنح الإذن",favorite:"أضف للمفضلة",remove:"إزالة من المفضلة",login:"سجّل الدخول لإضافة المفضلة",linked:"افتح المتجر وارتبط بحسابك أولاً لإضافته للمفضلة",unavailable:"تعذر تحديث المفضلة",km:"كم",unknown:"لا توجد إحداثيات منشورة للفروع"},en:{near:"Near me",locating:"Finding location",denied:"Location unavailable or permission denied",favorite:"Add to favorites",remove:"Remove favorite",login:"Sign in to save favorites",linked:"Visit the store and connect your account first",unavailable:"Could not update favorite",km:"km",unknown:"No published branch coordinates"},fr:{near:"Près de moi",locating:"Localisation",denied:"Position indisponible ou autorisation refusée",favorite:"Ajouter aux favoris",remove:"Retirer des favoris",login:"Connectez-vous pour enregistrer",linked:"Visitez la boutique et associez votre compte",unavailable:"Modification impossible",km:"km",unknown:"Aucune coordonnée de succursale publiée"}}[locale];
 useEffect(()=>{let mounted=true;fetch("/api/customer/favorite-stores",{cache:"no-store",credentials:"same-origin"}).then(async r=>{if(r.status===401)return null;if(!r.ok)throw Error();return r.json();}).then(data=>{if(mounted&&data?.ok){setSignedIn(true);setFavorites(data.tenantIds)}}).catch(()=>{});return()=>{mounted=false}},[]);
 const locate=()=>{if(!navigator.geolocation){setNotice(t.denied);return;}setNotice(t.locating);navigator.geolocation.getCurrentPosition(p=>{setPosition({lat:p.coords.latitude,lng:p.coords.longitude});setNotice("");},()=>setNotice(t.denied),{enableHighAccuracy:false,maximumAge:300000,timeout:10000});};
 const toggle=async(id:string)=>{if(!signedIn){setNotice(t.login);return;}setPending(id);setNotice("");const remove=favoriteIds.includes(id);try{const r=await fetch("/api/customer/favorite-stores",{method:remove?"DELETE":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tenantId:id}),credentials:"same-origin"});if(!r.ok){setNotice(r.status===404?t.linked:r.status===401?t.login:t.unavailable);return;}setFavorites(a=>remove?a.filter(x=>x!==id):[...a,id]);}catch{setNotice(t.unavailable)}finally{setPending(null)}};
 const sorted=position?[...places].map(p=>({...p,d:p.lat!==null&&p.lng!==null?distanceKm(position.lat,position.lng,p.lat,p.lng):null})).filter(p=>p.d!==null).sort((a,b)=>(a.d??Infinity)-(b.d??Infinity)):null;
 return <section className="foonMarketPersonal" aria-label={t.near}>
 <button type="button" onClick={locate}>{t.near} ◉</button>
 {position&&<span role="status">{sorted?.length?sorted.slice(0,3).map(p=>`${places.find(v=>v.id===p.id)?.id.slice(0,8)}: ${p.d?.toFixed(1)} ${t.km}`).join(" · "):t.unknown}</span>}
 {notice&&<span role="status">{notice}</span>}
 <div className="foonMarketFavoriteControls">{places.map(p=><button key={p.id} type="button" data-store={p.id} aria-label={favoriteIds.includes(p.id)?t.remove:t.favorite} aria-pressed={favoriteIds.includes(p.id)} disabled={pending===p.id} onClick={()=>toggle(p.id)}>{favoriteIds.includes(p.id)?"♥":"♡"}</button>)}</div>
 </section>;
}
