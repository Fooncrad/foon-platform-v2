"use client";
import {useEffect,useState} from "react";
type Language="ar"|"en"|"fr";
export type CashFloorSeat={layoutId:string;floorTableId:string;sectionId:string}|null;
type FloorTable={id:string;number:string;seats:number;x:number;y:number;status:string};
type FloorLayout={id:string;name:string;sectionId:string;sectionName:string;sectionNameEn:string;sectionNameFr:string;width:number;height:number;tables:FloorTable[]};
export default function CustomerFloorMap({slug,branch,language,partySize,selected,onSelect}:{slug:string;branch:string;language:Language;partySize:number;selected:CashFloorSeat;onSelect:(next:CashFloorSeat)=>void}){
 const [layouts,setLayouts]=useState<FloorLayout[]>([]),[bookingFee,setBookingFee]=useState(0),[active,setActive]=useState(""),[busy,setBusy]=useState(true),[error,setError]=useState("");
 const tr=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 useEffect(()=>{let alive=true;void Promise.resolve().then(async()=>{setBusy(true);setError("");try{
   const response=await fetch("/api/customer/floor-map?storeSlug="+encodeURIComponent(slug)+"&branch="+encodeURIComponent(branch),{cache:"no-store"});
   const data=await response.json();if(!response.ok||!data.ok)throw Error(String(data.code||"FLOOR_MAP_UNAVAILABLE"));
   if(alive){const list:FloorLayout[]=Array.isArray(data.layouts)?data.layouts:[];setLayouts(list);setBookingFee(Number(data.bookingFee)||0);setActive(list[0]?.id||"");onSelect(null)}
  }catch{if(alive){setLayouts([]);setError(tr("تعذر عرض مخطط الطاولات الآن.","Floor plans are temporarily unavailable.","Les plans sont momentanément indisponibles."))}}finally{if(alive)setBusy(false)}
 });return()=>{alive=false}},[slug,branch]); // selection is reset on branch change only
 const layout=layouts.find(l=>l.id===active);
 const eligible=(table:FloorTable)=>table.status==="available"&&table.seats>=partySize;
 return <section aria-label={tr("اختيار الجلسة من المخطط","Choose a seat from floor plan","Choisir une table sur le plan")} style={{display:"grid",gap:12,marginBlock:12,padding:12,border:"1px solid var(--public-line,#d5d5d5)",borderRadius:12}}>
  <h3 style={{margin:0,fontSize:16}}>{tr("اختر جلستك على المخطط","Select your table on the map","Choisissez votre table sur le plan")}</h3>
  <p style={{fontSize:12,margin:0}}>{tr("الدفع نقدًا عند الحضور. سيصل طلبك للمطعم للموافقة. الحالات الحالية ليست ضمانًا للتوفر في موعدك؛ يجري التحقق عند إرسال الحجز.","Pay cash at the venue. The restaurant will review your request. Current table status is not availability at your selected time; availability is checked on submission.","Paiement en espèces sur place. Le restaurant examinera la demande. La disponibilité pour le créneau choisi sera vérifiée à l'envoi.")}</p>
  {bookingFee>0&&<p style={{margin:0,fontSize:13,fontWeight:700}}>{tr("رسوم الحجز النقدية عند الحضور: ","Cash booking fee on arrival: ","Frais à payer en espèces sur place : ")}<span dir="ltr">{bookingFee.toFixed(2)}</span></p>}
  {busy?<p role="status">{tr("جار تحميل المخطط…","Loading floor plan…","Chargement du plan…")}</p>:error?<p role="alert">{error}</p>:!layouts.length?<p role="status">{tr("لا توجد مخططات نشطة بطاولات مرتبطة بهذا الفرع. يمكنك استخدام الحجز العادي.","No active floor plans with linked tables for this branch. Use classic booking instead.","Aucun plan actif avec des tables liées. Utilisez la réservation classique.")}</p>:<>
   <div style={{display:"flex",gap:7,overflowX:"auto",paddingBlock:3}}>{layouts.map(l=><button type="button" key={l.id} aria-pressed={active===l.id} onClick={()=>{setActive(l.id);onSelect(null)}} style={{flex:"0 0 auto",padding:"8px 12px",border:"1px solid #c7d4d1",borderRadius:10,background:active===l.id?"#e2f4ef":"transparent",color:"inherit"}}>{l.name} · {language==="en"?l.sectionNameEn||l.sectionName:language==="fr"?l.sectionNameFr||l.sectionName:l.sectionName}</button>)}</div>
   {layout&&<div style={{position:"relative",height:340,width:"100%",backgroundColor:"#faf7ed",backgroundImage:"linear-gradient(#d9d6ca70 1px,transparent 1px),linear-gradient(90deg,#d9d6ca70 1px,transparent 1px)",backgroundSize:"30px 30px",border:"1px solid #d4c7ac",borderRadius:12,overflow:"hidden"}}>{layout.tables.map(t=>{
    const chosen=selected?.layoutId===layout.id&&selected?.floorTableId===t.id,ready=eligible(t);
    return <button type="button" key={t.id} disabled={!ready} title={tr("طاولة","Table","Table")+" "+t.number} aria-pressed={chosen} onClick={()=>onSelect({layoutId:layout.id,floorTableId:t.id,sectionId:layout.sectionId})} style={{position:"absolute",left:Math.min(91,t.x/layout.width*100)+"%",top:Math.min(86,t.y/layout.height*100)+"%",padding:"8px 7px",minWidth:58,minHeight:54,background:chosen?"#b9e8d7":ready?"#e3f4e9":"#e4e4e7",color:"#173b30",border:chosen?"3px solid #147d72":"1px solid #a5b8b1",borderRadius:13,opacity:ready?1:.55,transform:"translate(-25%,-25%)",fontVariantNumeric:"tabular-nums"}}><strong dir="ltr">#{t.number}</strong><small style={{display:"block"}}>{t.seats} {tr("مقاعد","seats","places")}</small></button>})}</div>}
   <p aria-live="polite" style={{fontSize:12,margin:0}}>{selected?tr("الجلسة المحددة: ","Selected seat: ","Table choisie : ")+String(layout?.tables.find(t=>t.id===selected.floorTableId)?.number||""):tr("اختر طاولة خضراء مناسبة لعدد الضيوف.","Choose an available green table with enough seats.","Choisissez une table verte adaptée au nombre de personnes.")}</p>
  </>}
 </section>;
}
