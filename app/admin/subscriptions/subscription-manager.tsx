"use client";
import {useEffect,useState,type FormEvent} from "react";
type Tenant={tenant_id:string;tenant_name:string;plan_id:string|null;plan_name:string|null;status:string|null;starts_at:string|null;ends_at:string|null};
type Plan={id:string;name_ar:string;enabled:number|boolean};
export default function SubscriptionManager({canEdit}:{canEdit:boolean}){
 const [tenants,setTenants]=useState<Tenant[]>([]),[plans,setPlans]=useState<Plan[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[selected,setSelected]=useState("");
 const [plan,setPlan]=useState(""),[status,setStatus]=useState("pending"),[start,setStart]=useState(""),[end,setEnd]=useState("");
 async function refresh(){const [a,b]=await Promise.all([fetch("/api/admin/subscriptions"),fetch("/api/admin/plans")]);const x=await a.json(),y=await b.json();if(!a.ok||!b.ok)throw Error(x.code??y.code??"LOAD_FAILED");setTenants(x.tenants??[]);setPlans(y.plans??[]);}
 useEffect(()=>{let active=true;Promise.all([fetch("/api/admin/subscriptions"),fetch("/api/admin/plans")]).then(async ([a,b])=>{const x=await a.json(),y=await b.json();if(!a.ok||!b.ok)throw Error(x.code??y.code??"LOAD_FAILED");if(active){setTenants(x.tenants??[]);setPlans(y.plans??[]);}}).catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 function choose(id:string){setSelected(id);const t=tenants.find(x=>x.tenant_id===id);setPlan(t?.plan_id??"");setStatus(t?.status??"pending");setStart(t?.starts_at?String(t.starts_at).slice(0,10):"");setEnd(t?.ends_at?String(t.ends_at).slice(0,10):"");}
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!selected||!plan)return;setBusy(true);setError("");
 try{const r=await fetch("/api/admin/subscriptions",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({tenant_id:selected,plan_id:plan,status,starts_at:start||null,ends_at:end||null})});const j=await r.json();if(!r.ok)throw Error(j.code??"SAVE_FAILED");await refresh();setError("تم حفظ الاشتراك بنجاح.");}
 catch(e){setError("تعذر الحفظ: "+String(e));}finally{setBusy(false);}}
 return <section className="adminPanel"><h2>اشتراكات المطاعم والمتاجر</h2>
 {loading?<p>جارٍ تحميل الاشتراكات…</p>:<><p>عدد الأنشطة المعروضة: {tenants.length}</p>
 <div className="workspace-grid">{tenants.map(t=><article key={t.tenant_id}><strong>{t.tenant_name}</strong><span>{t.plan_name??"دون باقة"}</span><small>{t.status??"غير مشترك"}</small></article>)}</div>
 {canEdit&&<form className="auth-form" onSubmit={save} style={{maxWidth:520}}>
 <label>المطعم أو المتجر<select required value={selected} onChange={e=>choose(e.target.value)}><option value="">اختر النشاط</option>{tenants.map(t=><option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name}</option>)}</select></label>
 <label>الباقة<select required value={plan} onChange={e=>setPlan(e.target.value)}><option value="">اختر الباقة</option>{plans.filter(p=>Boolean(p.enabled)).map(p=><option key={p.id} value={p.id}>{p.name_ar}</option>)}</select></label>
 <label>الحالة<select value={status} onChange={e=>setStatus(e.target.value)}><option value="pending">معلق</option><option value="active">نشط</option><option value="expired">منتهي</option><option value="cancelled">ملغي</option></select></label>
 <label>تاريخ البداية<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
 <label>تاريخ النهاية<input type="date" value={end} onChange={e=>setEnd(e.target.value)} min={start||undefined}/></label>
 <button disabled={busy||!selected||!plan}>{busy?"جارٍ الحفظ…":"حفظ اشتراك النشاط"}</button>
 </form>}</>}
 {error&&<p role="status">{error}</p>}</section>;
}
