"use client";
import {useEffect,useState} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
type VisitCounts={total:number;today:number;last7Days:number;last30Days:number};
export default function CreatorProfileInsights({publicProfile}:{publicProfile:boolean}){
 const language=useUiLanguage();const t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const [data,setData]=useState<VisitCounts|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch("/api/public/visits?kind=profile",{cache:"no-store",signal:controller.signal})
   .then(async r=>{const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok||!d.visits)throw Error("INSIGHTS_UNAVAILABLE");return d.visits as VisitCounts;})
   .then(d=>{if(controller.signal.aborted)return;setData(d);setLoading(false);})
   .catch(()=>{if(controller.signal.aborted)return;setError(true);setLoading(false);});
  return()=>controller.abort();
 },[]);
 const cards=[{label:t("اليوم","Today","Aujourd’hui"),value:data?.today??0},{label:t("آخر 7 أيام","Last 7 days","7 derniers jours"),value:data?.last7Days??0},{label:t("آخر 30 يومًا","Last 30 days","30 derniers jours"),value:data?.last30Days??0},{label:t("إجمالي الأيام المسجّلة","All recorded visits","Visites enregistrées"),value:data?.total??0}];
 return <section className="creatorInsightsPanel" aria-labelledby="creator-insights-heading">
  <h2 id="creator-insights-heading">{t("إحصائيات بروفايلي العام","Public profile insights","Statistiques du profil public")}</h2>
  <p>{t("عدد زيارات تقريبي يُحسب مرة واحدة لكل زائر في اليوم، ولا يعرض هويات الزوار أو عناوينهم.","Approximate visits, deduplicated once per visitor per day. No visitor identity or address is shown.","Visites approximatives dédoublonnées une fois par jour et par visiteur, sans identité ni adresse.")}</p>
  {!publicProfile&&<p className="creatorInsightsPrivate">{t("ملفك خاص حاليًا ولا يسجل زيارات عامة جديدة. الإحصائيات القديمة تبقى خاصة بك.","Your profile is private; new public visits are not recorded. Past statistics remain private.","Votre profil est privé ; aucune nouvelle visite publique n’est comptabilisée.")}</p>}
  {loading?<p role="status">{t("جارٍ تحميل الإحصائيات...","Loading insights...","Chargement des statistiques...")}</p>:error?<p role="alert">{t("تعذر تحميل إحصائيات الزيارات.","Could not load visitor insights.","Impossible de charger les statistiques.")}</p>:<div className="creatorInsightsGrid">{cards.map(card=><article key={card.label}><strong dir="ltr">{card.value.toLocaleString("en-US")}</strong><span>{card.label}</span></article>)}</div>}
 </section>;
}
