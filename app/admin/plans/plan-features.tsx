"use client";
import {useUiText,useUiLanguage} from "@/lib/i18n/ui-language";
import {useEffect,useState} from "react";
import {activityFeatureSupport} from "@/lib/platform/activity-plan-entitlements";
import {type ActivityType} from "@/lib/platform/activity-presets";
import {registrationActivities} from "@/lib/tenant/registration-activities";
type Feature={feature_key:string;name_ar:string;name_en?:string;category:string;enabled:number|boolean;limit_value:number|null;overridden:boolean|number};
export default function PlanFeatures({planId,canEdit}:{planId:string;canEdit:boolean}){
 const language=useUiLanguage(),[activity,setActivity]=useState<ActivityType|"">("restaurant");
 const t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 return <details><summary>{t("المميزات وحدود الباقة حسب النشاط","Plan features and limits by activity","Fonctionnalités et limites par activité")}</summary>
 <label htmlFor={"plan-activity-"+planId}>{t("تخصيص النشاط","Customize activity","Personnaliser l’activité")}</label>
 <select id={"plan-activity-"+planId} value={activity} onChange={e=>setActivity(e.target.value as ActivityType|"")}><option value="">{t("الإعداد المشترك للباقة","Shared plan defaults","Paramètres communs")}</option>{registrationActivities.map(a=><option key={a.id} value={a.id}>{a[language]}</option>)}</select>
 <p>{activity?t("التعديل يخص النشاط المحدد في هذه الباقة فقط. الموروث يتبع الإعداد المشترك حتى تخصيصه.","Changes affect only this activity in this plan. Inherited features follow shared defaults until customized.","Les modifications concernent uniquement cette activité dans cette offre. Les valeurs héritées suivent les paramètres communs."):t("التعديل المشترك يؤثر على الأنشطة التي لم تخصص هذه الميزة.","Shared changes affect activities that have not overridden this feature.","Les modifications communes concernent les activités sans personnalisation de cette fonctionnalité.")}</p>
 <PlanFeatureEditor key={planId+":"+activity} planId={planId} activity={activity} canEdit={canEdit}/></details>;
}
function PlanFeatureEditor({planId,activity,canEdit}:{planId:string;activity:ActivityType|"";canEdit:boolean}){
 const translateUi=useUiText(),language=useUiLanguage();
 const t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const serviceActivity=["carwash","laundry","automotive","salon","publicworks"].includes(activity);
 const featureName=(f:Feature)=>f.feature_key==="digital_menu"?t("كتالوج المنتجات وحد الأصناف والأقسام","Product catalog: item and category limits","Catalogue produits : limites des articles et catégories"):
 f.feature_key==="catalog"&&serviceActivity?t("كتالوج الخدمات وحد الخدمات والأقسام","Service catalog: service and category limits","Catalogue de services : limites des services et catégories"):
 language==="en"?f.name_en??translateUi(f.name_ar):translateUi(f.name_ar);
 const [features,setFeatures]=useState<Feature[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(""),[loading,setLoading]=useState(true);
 const url="/api/admin/plans/"+encodeURIComponent(planId)+"/features";
 useEffect(()=>{let active=true;fetch(url+(activity?"?activity="+activity:""),{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.code);if(active)setFeatures(j.features??[]);}).catch(()=>{if(active)setError("FEATURES_UNAVAILABLE");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[url,activity]);
 async function save(feature:Feature,enabled:boolean,limit:number|null,reset=false){
  setBusy(feature.feature_key);setError("");
  try{
   const r=await fetch(url,{method:reset?"DELETE":"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({feature_key:feature.feature_key,enabled,limit_value:limit,...(activity?{activity}:{})})});const j=await r.json();if(!r.ok)throw Error(j.code);
   if(reset){const response=await fetch(url+"?activity="+activity,{cache:"no-store"}),data=await response.json();if(!response.ok)throw Error(data.code);setFeatures(data.features??[]);}
   else setFeatures(v=>v.map(f=>f.feature_key===feature.feature_key?{...f,enabled,limit_value:limit,overridden:Boolean(activity)}:f));
  }catch(e){setError(String(e));}finally{setBusy("");}
 }
 const filtered=features.filter(f=>!activity||activityFeatureSupport(activity,f.feature_key)==="supported");
 return <div><p>{activity?t("تعرض هذه القائمة المميزات المناسبة للنشاط فقط. إعدادات بقية الأنشطة والباقة المشتركة محفوظة.","Only applicable features are shown. Other activity and shared settings remain intact.","Seules les fonctionnalités pertinentes sont affichées ; les autres paramètres sont conservés."):t("الإعدادات المشتركة لا تغيّر تخصيصات الأنشطة المحفوظة.","Shared defaults do not overwrite activity-specific settings.","Les paramètres communs ne remplacent pas les personnalisations.")}</p>{loading?<p role="status">{translateUi("جارٍ التحميل…")}</p>:<div style={{maxHeight:420,overflowY:"auto"}}>{filtered.map(f=><div key={f.feature_key} style={{padding:"8px 0",borderBottom:"1px solid #7774"}}>
 <strong>{featureName(f)}</strong> <small dir="ltr">{f.feature_key}</small>{activity&&<small> · {f.overridden?t("مخصص لهذا النشاط","Customized","Personnalisé"):t("موروث من الباقة","Inherited","Hérité")}</small>}
 <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
 <label><input type="checkbox" disabled={!canEdit||Boolean(busy)} checked={Boolean(f.enabled)} onChange={e=>void save(f,e.target.checked,f.limit_value)}/> {translateUi("مفعّلة")}</label>
 {canEdit&&(f.feature_key==="digital_menu"||f.feature_key==="catalog")&&<label>{translateUi("الحد")}<input aria-label={translateUi("الحد")+" "+featureName(f)} style={{width:90}} type="number" min="0" max="2147483647" step="1" disabled={Boolean(busy)} defaultValue={f.limit_value??""} key={f.feature_key+String(f.limit_value)} onBlur={e=>{const value=e.target.value.trim(),limit=value===""?null:Number(value);if((limit===null||Number.isSafeInteger(limit)&&limit>=0&&limit<=2147483647)&&limit!==f.limit_value)void save(f,Boolean(f.enabled),limit);}}/><small>{t("فارغ: بلا حد؛ 0: لا يسمح بإضافة سجلات.","Empty: unlimited; 0: no new records.","Vide : illimité ; 0 : aucun nouvel enregistrement.")}</small></label>}
 {activity&&canEdit&&Boolean(f.overridden)&&<button type="button" disabled={Boolean(busy)} onClick={()=>void save(f,Boolean(f.enabled),f.limit_value,true)}>{t("استعادة إعداد الباقة","Restore shared default","Rétablir la valeur commune")}</button>}
 </div></div>)}</div>}{error&&<p role="alert" className="form-error">{t("تعذر حفظ أو تحميل المميزات. حاول مجددًا.","Could not save or load features. Please try again.","Impossible d’enregistrer ou de charger les fonctionnalités. Réessayez.")} <small dir="ltr">{error}</small></p>}</div>;
}
