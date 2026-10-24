"use client";
import {useEffect,useState} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";

type NumberGroup={total:number;today:number;last7:number};
type ProductView={id:string;kind:string;name:string;views:number};
type Stats={ok:true;storefront:NumberGroup;products:NumberGroup;items:ProductView[];productCount:number;limit:number;offset:number};
export default function MerchantVisitStats({tenantId}:{tenantId:string}){
 const lang=useUiLanguage();
 const t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 const [stats,setStats]=useState<Stats|null>(null),[offset,setOffset]=useState(0);
 const [loading,setLoading]=useState(true),[error,setError]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  // The active tenant is part of the request; React unmounts stale-tenant data.
  fetch("/api/analytics/stats?tenant="+encodeURIComponent(tenantId)+"&offset="+offset,{cache:"no-store",signal:controller.signal})
   .then(async response=>{if(!response.ok)throw Error("STATS_UNAVAILABLE");return response.json() as Promise<Stats>})
   .then(data=>{if(!controller.signal.aborted){setStats(data);setLoading(false);setError(false);}})
   .catch(()=>{if(!controller.signal.aborted){setStats(null);setLoading(false);setError(true);}});
  return()=>controller.abort();
 },[tenantId,offset]);
 const number=(n:number)=>new Intl.NumberFormat(lang==="ar"?"ar-SA-u-nu-latn":lang==="fr"?"fr-FR":"en-GB",{numberingSystem:"latn"}).format(n);
 return <section className="restaurantPanel foonVisitAnalytics" aria-label={t("إحصائيات زيارات الواجهة والمنتجات","Store and product visit analytics","Statistiques des visites de la boutique et des produits")}>
  <header><div><h3>{t("زيارات واجهة النشاط والمنتجات","Storefront and product visits","Visites de la vitrine et des produits")}</h3>
   <p>{t("زيارات فريدة تقريبية لكل متصفح يوميًا. لا تُحتسب زيارات حسابات النشاط، وتبدأ الإحصائيات من تفعيل الميزة.","Approximate unique visits per browser per day. Staff and owner views excluded; tracking starts when enabled.","Visites uniques approximatives par navigateur et par jour. Les visites du personnel sont exclues ; le suivi commence après activation.")}</p></div></header>
  {loading&&<p role="status">{t("جارٍ تحميل الإحصائيات…","Loading analytics…","Chargement des statistiques…")}</p>}
  {error&&<p role="alert">{t("تعذر تحميل الزيارات. تأكد من تطبيق ترحيل قاعدة البيانات 0162.","Unable to load visits. Confirm that database migration 0162 is applied.","Impossible de charger les visites. Vérifiez la migration 0162.")}</p>}
  {stats&&<>
   <div className="foonVisitAnalyticsGrid">
    <article><small>{t("إجمالي زيارات الواجهة","Storefront visits","Visites de la vitrine")}</small><strong>{number(stats.storefront.total)}</strong><span>{t("اليوم","Today","Aujourd’hui")}: {number(stats.storefront.today)} · {t("7 أيام","7 days","7 jours")}: {number(stats.storefront.last7)}</span></article>
    <article><small>{t("مشاهدات تفاصيل المنتجات","Product detail views","Vues des fiches produits")}</small><strong>{number(stats.products.total)}</strong><span>{t("اليوم","Today","Aujourd’hui")}: {number(stats.products.today)} · {t("7 أيام","7 days","7 jours")}: {number(stats.products.last7)}</span></article>
   </div>
   <h4>{t("زيارات كل صنف أو منتج","Views by product","Vues par produit")}</h4>
   <div className="foonVisitAnalyticsList">
    {stats.items.map(item=><div key={item.kind+":"+item.id} className="foonVisitAnalyticsRow">
      <span>{item.name}<small>{item.kind==="restaurant_item"?t("صنف المنيو","Menu item","Article du menu"):t("منتج أو خدمة","Product or service","Produit ou service")}</small></span>
      <strong dir="ltr">{number(item.views)}</strong>
     </div>)}
    {!stats.items.length&&<p>{t("لا توجد منتجات مسجّلة بعد.","No products recorded yet.","Aucun produit enregistré.")}</p>}
   </div>
   {stats.productCount>stats.limit&&<div className="foonVisitAnalyticsPagination">
    <button type="button" disabled={loading||offset===0} onClick={()=>{setLoading(true);setOffset(x=>Math.max(0,x-25));}}>{t("السابق","Previous","Précédent")}</button>
    <span>{number(Math.min(stats.productCount,offset+1))}–{number(Math.min(stats.productCount,offset+stats.items.length))} / {number(stats.productCount)}</span>
    <button type="button" disabled={loading||offset+stats.limit>=stats.productCount} onClick={()=>{setLoading(true);setOffset(x=>x+25);}}>{t("التالي","Next","Suivant")}</button>
   </div>}
  </>}
 </section>;
}
