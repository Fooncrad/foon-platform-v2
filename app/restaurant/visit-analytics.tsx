"use client";
import {useEffect,useState} from "react";
type Counts={total:number;today:number;last7Days:number;last30Days:number};
type ProductView={id:string;name:string;views:number};
export default function VisitAnalytics({tenantId,language="ar",profile=false}:{tenantId?:string;language?:"ar"|"en"|"fr";profile?:boolean}){
 const [visits,setVisits]=useState<Counts|null>(null),[products,setProducts]=useState<Counts|null>(null),[top,setTop]=useState<ProductView[]>([]),[error,setError]=useState(false);
 useEffect(()=>{
  let live=true;setVisits(null);setProducts(null);setTop([]);setError(false);
  const load=async(kind:"profile"|"storefront"|"product")=>{
   const params=new URLSearchParams({kind});
   if(!profile&&tenantId)params.set("tenantId",tenantId);
   const response=await fetch("/api/public/visits?"+params.toString(),{cache:"no-store"});
   if(!response.ok)throw new Error("VISIT_STATS_UNAVAILABLE");
   const json=await response.json() as {visits:Counts};
   return json.visits;
  };
  if(!profile&&tenantId)void fetch("/api/public/visits?kind=product&top=1&tenantId="+encodeURIComponent(tenantId),{cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error("UNAVAILABLE");return await response.json() as {products:ProductView[]}}).then(result=>{if(live)setTop(result.products)}).catch(()=>{});
  void Promise.all([load(profile?"profile":"storefront"),...(profile?[]:[load("product")])]).then(values=>{
   if(!live)return;setVisits(values[0]);if(values[1])setProducts(values[1]);
  }).catch(()=>{if(live)setError(true)});
  return ()=>{live=false};
 },[tenantId,profile]);
 const translate=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const locale=language==="ar"?"en-US":language==="fr"?"fr-FR":"en-US";
 const format=(n:number|undefined)=>n===undefined?"—":new Intl.NumberFormat(locale).format(n);
 return <section className="restaurantPanel" aria-label={translate("إحصائيات الزيارات","Visit analytics","Statistiques des visites")} style={{marginBlock:"16px"}}>
  <header><div><h3>{translate("إحصائيات الزيارات","Visit analytics","Statistiques des visites")}</h3><p>{translate("زيارات فريدة يومياً، دون احتساب زيارات المالك","Daily unique visits, excluding owner views","Visites uniques quotidiennes, hors propriétaire")}</p></div></header>
  {error?<p role="status">{translate("إحصائيات الزيارات غير متاحة حالياً","Visit statistics unavailable","Statistiques momentanément indisponibles")}</p>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:12,padding:12}}>
   {([
    [translate("إجمالي الزيارات","Total visits","Total des visites"),visits?.total],
    [translate("زيارات اليوم","Visits today","Visites aujourd’hui"),visits?.today],
    [translate("آخر 7 أيام","Last 7 days","7 derniers jours"),visits?.last7Days],
    [translate("آخر 30 يوماً","Last 30 days","30 derniers jours"),visits?.last30Days],
    ...(profile?[]:[[translate("مشاهدات المنتجات","Product views","Vues des produits"),products?.total] as const])
   ] as Array<[string,number|undefined]>).map(([label,value])=><article key={label} style={{border:"1px solid var(--border,#e4e4e7)",borderRadius:12,padding:14,minWidth:0}}><small>{label}</small><strong style={{display:"block",fontSize:24,marginTop:8,fontVariantNumeric:"tabular-nums"}}>{format(value)}</strong></article>)}
  </div>}
  {!profile&&top.length>0&&<div style={{padding:"0 12px 12px"}}><h4 style={{marginBlock:"6px 12px"}}>{translate("المنتجات الأكثر مشاهدة","Most viewed products","Produits les plus consultés")}</h4><div style={{display:"grid",gap:8}}>{top.map(item=><div key={item.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"10px 12px",border:"1px solid var(--border,#e4e4e7)",borderRadius:10}}><span style={{overflowWrap:"anywhere"}}>{item.name}</span><strong>{format(item.views)}</strong></div>)}</div></div>}
 </section>;
}
