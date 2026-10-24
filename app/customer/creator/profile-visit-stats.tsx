"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
type Response={ok:true;profile:{handle:string;visibility:string}|null;visits:{total:number;today:number;last7:number}};
export default function CreatorProfileVisitStats(){
 const lang=useUiLanguage();
 const t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 const [data,setData]=useState<Response|null>(null),[unavailable,setUnavailable]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch("/api/analytics/stats?scope=creator",{cache:"no-store",signal:controller.signal})
   .then(async r=>{if(!r.ok)throw Error("UNAVAILABLE");return r.json() as Promise<Response>})
   .then(value=>{if(!controller.signal.aborted)setData(value);})
   .catch(()=>{if(!controller.signal.aborted)setUnavailable(true);});
  return()=>controller.abort();
 },[]);
 if(unavailable)return <p className="foonCreatorVisitStats" role="status">{t("تعذر عرض إحصائيات ملفك مؤقتًا.","Your profile views are temporarily unavailable.","Les visites du profil sont momentanément indisponibles.")}</p>;
 if(!data?.profile)return null;
 const format=(n:number)=>new Intl.NumberFormat(lang==="ar"?"ar-SA-u-nu-latn":lang==="fr"?"fr-FR":"en-GB",{numberingSystem:"latn"}).format(n);
 return <section className="foonCreatorVisitStats" aria-label={t("زيارات ملفي العام","My public profile visits","Visites de mon profil public")}>
  <h2>{t("زيارات ملفي العام","Public profile visits","Visites de mon profil public")}</h2>
  <div className="foonCreatorVisitTotals">
   <span><small>{t("الإجمالي","All time","Total")}</small><strong>{format(data.visits.total)}</strong></span>
   <span><small>{t("اليوم","Today","Aujourd’hui")}</small><strong>{format(data.visits.today)}</strong></span>
   <span><small>{t("آخر 7 أيام","Last 7 days","7 derniers jours")}</small><strong>{format(data.visits.last7)}</strong></span>
  </div>
  <p>{data.profile.visibility!=="public"?t("ملفك خاص حاليًا؛ لا تُسجّل زيارات جديدة إلا بعد جعله عامًا.","Your profile is currently private; no new views are recorded until it is public.","Votre profil est privé ; les nouvelles visites ne sont comptées qu’après sa publication."):t("زيارات فريدة تقريبية لكل متصفح يوميًا، ولا تُحتسب زيارتك لملفك.","Approximate unique views per browser each day; your own visits are excluded.","Visites uniques approximatives par navigateur et par jour ; vos propres visites sont exclues.")}</p>
  {data.profile.visibility==="public"&&<Link href={"/creators/"+encodeURIComponent(data.profile.handle)}>{t("فتح الملف العام","Open public profile","Voir le profil public")}</Link>}
 </section>;
}
