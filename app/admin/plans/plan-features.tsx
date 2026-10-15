"use client";
import {useEffect,useState} from "react";
import {ACTIVITY_PRESETS, MODULE_LABELS, type ActivityType} from "@/lib/platform/activity-presets";
type Feature={feature_key:string;name_ar:string;category:string;enabled:number|boolean;limit_value:number|null};
export default function PlanFeatures({planId,canEdit}:{planId:string;canEdit:boolean}){
 const [activity,setActivity]=useState<ActivityType>("restaurant");
 const [features,setFeatures]=useState<Feature[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;fetch("/api/admin/plans/"+planId+"/features").then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.code);if(active)setFeatures(j.features??[]);}).catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[planId]);
 async function save(feature:Feature,enabled:boolean,limit:number|null){
  setBusy(feature.feature_key);setError("");
  try{const r=await fetch("/api/admin/plans/"+planId+"/features",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({feature_key:feature.feature_key,enabled,limit_value:limit})});const j=await r.json();if(!r.ok)throw Error(j.code);setFeatures(v=>v.map(f=>f.feature_key===feature.feature_key?{...f,enabled,limit_value:limit}:f));}
  catch(e){setError(String(e));}finally{setBusy("");}
 }
 const supported=new Set<string>(ACTIVITY_PRESETS[activity]);
 const aliases:Record<string,string>={waiter_call:"waiter",kds:"kitchen",service_catalog:"services",appointments:"bookings",takeaway:"pickup",digital_menu:"catalog",qr_menu:"catalog"};
 const allModules=new Set<string>(Object.values(ACTIVITY_PRESETS).flatMap(modules=>[...modules]));
 const filtered=features.filter(f=>{const module=aliases[f.feature_key]??f.feature_key;return !allModules.has(module)||supported.has(module);});
 return <details><summary>المميزات وحدود الباقة ({features.filter(f=>Boolean(f.enabled)).length}/{features.length})</summary>
 <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",margin:"12px 0"}}><label htmlFor={"plan-activity-"+planId}>عرض مميزات النشاط</label><select id={"plan-activity-"+planId} value={activity} onChange={e=>setActivity(e.target.value as ActivityType)}>{(Object.keys(ACTIVITY_PRESETS) as ActivityType[]).map(code=><option key={code} value={code}>{code}</option>)}</select><small>المميزات المشتركة تظهر لجميع الأنشطة؛ هذا العرض لا يغيّر منح الباقة.</small></div>
 {loading?<p>جارٍ التحميل…</p>:<div style={{maxHeight:360,overflowY:"auto"}}>{filtered.map(f=><div key={f.feature_key} style={{padding:"8px 0",borderBottom:"1px solid #7774"}}>
 <strong>{MODULE_LABELS[f.feature_key]?.ar??f.name_ar}</strong> <small dir="ltr">{f.feature_key}</small>
 <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
 <label><input type="checkbox" disabled={!canEdit||busy===f.feature_key} checked={Boolean(f.enabled)} onChange={e=>save(f,e.target.checked,f.limit_value)}/> مفعّلة</label>
 {canEdit&&<label>الحد <input aria-label={"حد "+f.name_ar} style={{width:90}} type="number" min="0" defaultValue={f.limit_value??""} key={f.feature_key+String(f.limit_value)} onBlur={e=>{const value=e.target.value.trim();const limit=value===""?null:Number(value);if((limit===null||Number.isSafeInteger(limit)&&limit>=0)&&limit!==f.limit_value)save(f,Boolean(f.enabled),limit);}}/></label>}
 </div></div>)}</div>}
 {error&&<p role="alert" className="form-error">{error}</p>}</details>;
}
