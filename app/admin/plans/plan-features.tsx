"use client";
import {useEffect,useState} from "react";
type Feature={feature_key:string;name_ar:string;category:string;enabled:number|boolean;limit_value:number|null};
export default function PlanFeatures({planId,canEdit}:{planId:string;canEdit:boolean}){
 const [features,setFeatures]=useState<Feature[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;fetch("/api/admin/plans/"+planId+"/features").then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.code);if(active)setFeatures(j.features??[]);}).catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[planId]);
 async function save(feature:Feature,enabled:boolean,limit:number|null){
  setBusy(feature.feature_key);setError("");
  try{const r=await fetch("/api/admin/plans/"+planId+"/features",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({feature_key:feature.feature_key,enabled,limit_value:limit})});const j=await r.json();if(!r.ok)throw Error(j.code);setFeatures(v=>v.map(f=>f.feature_key===feature.feature_key?{...f,enabled,limit_value:limit}:f));}
  catch(e){setError(String(e));}finally{setBusy("");}
 }
 return <details><summary>المميزات وحدود الباقة ({features.filter(f=>Boolean(f.enabled)).length}/{features.length})</summary>
 {loading?<p>جارٍ التحميل…</p>:<div style={{maxHeight:360,overflowY:"auto"}}>{features.map(f=><div key={f.feature_key} style={{padding:"8px 0",borderBottom:"1px solid #7774"}}>
 <strong>{f.name_ar}</strong> <small dir="ltr">{f.feature_key}</small>
 <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
 <label><input type="checkbox" disabled={!canEdit||busy===f.feature_key} checked={Boolean(f.enabled)} onChange={e=>save(f,e.target.checked,f.limit_value)}/> مفعّلة</label>
 {canEdit&&<label>الحد <input aria-label={"حد "+f.name_ar} style={{width:90}} type="number" min="0" defaultValue={f.limit_value??""} key={f.feature_key+String(f.limit_value)} onBlur={e=>{const value=e.target.value.trim();const limit=value===""?null:Number(value);if((limit===null||Number.isSafeInteger(limit)&&limit>=0)&&limit!==f.limit_value)save(f,Boolean(f.enabled),limit);}}/></label>}
 </div></div>)}</div>}
 {error&&<p role="alert" className="form-error">{error}</p>}</details>;
}
