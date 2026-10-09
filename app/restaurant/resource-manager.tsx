"use client";
import {useEffect,useState,type FormEvent} from "react";
import {resourceModules,fieldLabels,type ResourceField} from "@/scripts/restaurant-resource-schema.mjs";
import type {StoredResource} from "@/lib/restaurant/operations";

export const operationLabels:Record<string,string>={PLAN_FEATURE_REQUIRED:"هذا القسم غير مشمول في الباقة الحالية.",PLAN_LIMIT_REACHED:"وصلت إلى الحد المسموح في الباقة.",FORBIDDEN:"لا تملك صلاحية هذا الإجراء.",CONFLICT:"تغيّرت البيانات. حدّث القائمة ثم أعد المحاولة.",DUPLICATE_RESOURCE:"الرمز أو الحساب مسجّل مسبقاً.",EMPLOYEE_ACCOUNT_NOT_FOUND:"يجب أن يكون الموظف مسجلاً بحساب نشط على FOON.",EMPLOYEE_ACCOUNT_IMMUTABLE:"لا يمكن تغيير الحساب المرتبط بملف الموظف.",REFERENCE_NOT_FOUND:"العنصر المرتبط غير متاح في هذا المطعم أو الفرع.",RECEIVED_PURCHASE_IMMUTABLE:"المشتريات المستلمة محفوظة كسجل ثابت ولا يمكن تعديل كمياتها.",REFUND_REQUIRED:"سجّل رد المبلغ قبل إلغاء طلب مدفوع."};
export async function operationApi(tenantId:string,module:string,method="GET",body?:unknown,branch?:string,extra?:Record<string,string>){
 const query=new URLSearchParams({...extra,...(branch?{branch}:{})}).toString();
 const response=await fetch("/api/restaurant/operations/"+module+(query?"?"+query:""),{method,headers:{"content-type":"application/json","x-foon-tenant":tenantId},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(operationLabels[result.code]??"تعذر إتمام العملية. راجع البيانات وحاول مجدداً.");
 return result;
}
function displayValue(value:unknown){if(value===null||value===undefined||value==="")return "—";return fieldLabels[String(value)]??String(value);}
export default function ResourceManager({tenantId,module,branch,branches,onChanged}:{tenantId:string;module:string;branch:string;branches:{id:string;name:string}[];onChanged?:()=>void}){
 const config=resourceModules[module];
 const [rows,setRows]=useState<StoredResource[]>([]),[refs,setRefs]=useState<Record<string,StoredResource[]>>({}),[loading,setLoading]=useState(true),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[editing,setEditing]=useState<StoredResource|null>(null),[showForm,setShowForm]=useState(false),[filter,setFilter]=useState("");
 const [uploads,setUploads]=useState<Record<string,string>>({});
 async function upload(key:string,file?:File){if(!file)return;if(file.size>2*1024*1024){setMessage("الحد الأقصى للصورة 2 ميجابايت.");return;}setBusy(true);setMessage("");try{const form=new FormData();form.set("file",file);const r=await fetch("/api/restaurant/assets",{method:"POST",headers:{"x-foon-tenant":tenantId},body:form});const result=await r.json();if(!r.ok)throw Error();setUploads(values=>({...values,[key]:result.url}));setMessage("تم رفع الصورة. احفظ الإعدادات لتطبيقها.");}catch{setMessage("تعذر رفع الصورة. استخدم PNG أو JPEG أو WebP بحجم أقل من 2 ميجابايت.");}finally{setBusy(false);}}
 async function refresh(){const result=await operationApi(tenantId,module,"GET",undefined,branch);setRows(result.resources);setRefs(result.references??{});}
 useEffect(()=>{let alive=true;operationApi(tenantId,module,"GET",undefined,branch).then(result=>{if(alive){setRows(result.resources);setRefs(result.references??{});setMessage("");setLoading(false);setShowForm(false);setEditing(null);}}).catch(error=>{if(alive){setMessage(String(error.message));setLoading(false);}});return()=>{alive=false;};},[tenantId,module,branch]);
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;const form=new FormData(event.currentTarget),data:Record<string,unknown>={};
  for(const f of config.fields){const value=String(form.get(f.key)??"").trim();data[f.key]=value===""?null:f.type==="number"?Number(value):f.type==="datetime"?new Date(value).toISOString():value;}
  setBusy(true);setMessage("");
  try{await operationApi(tenantId,module,editing?"PATCH":"POST",{...(editing?{id:editing.id,version:editing.version}:{}),name:form.get("name"),status:form.get("status"),branchId:form.get("branchId")||null,data});await refresh();setShowForm(false);setEditing(null);setMessage("تم حفظ البيانات.");onChanged?.();}
  catch(error){setMessage(error instanceof Error?error.message:"تعذر الحفظ.");}finally{setBusy(false);}
 }
 async function archive(row:StoredResource){if(busy)return;setBusy(true);setMessage("");try{await operationApi(tenantId,module,"DELETE",{id:row.id,version:row.version});await refresh();setMessage("تمت أرشفة السجل.");onChanged?.();}catch(error){setMessage(error instanceof Error?error.message:"تعذر الحفظ.");}finally{setBusy(false);}}
 function input(f:ResourceField){const value=uploads[f.key]??editing?.data[f.key],defaultValue=value==null?"":f.type==="datetime"?new Date(String(value)).toLocaleString("sv-SE").replace(" ","T").slice(0,16):String(value);
  if(f.type==="ref")return <select aria-label={f.label} name={f.key} required={f.required} defaultValue={defaultValue}><option value="">اختر {f.label}</option>{(refs[f.ref!]??[]).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>;
  if(f.type==="select")return <select aria-label={f.label} name={f.key} required={f.required} defaultValue={defaultValue||f.options?.[0]}>{f.options?.map(value=><option key={value} value={value}>{fieldLabels[value]??value}</option>)}</select>;
  if(f.type==="textarea")return <textarea name={f.key} required={f.required} maxLength={f.maxLength??3000} defaultValue={defaultValue}/>;
  const control=<input key={f.key+"-"+(uploads[f.key]??"")} name={f.key} type={f.type==="datetime"?"datetime-local":f.type==="color"?"color":f.type==="url"?"text":f.type} required={f.required} min={f.min} max={f.max} step={f.type==="number"?(f.integer?1:"any"):undefined} maxLength={f.maxLength??500} defaultValue={f.type==="color"?defaultValue||"#e76f3c":defaultValue}/>;
  return f.type==="url"?<>{control}<span className="restaurantImageUpload"><input aria-label={"رفع "+f.label} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>void upload(f.key,e.target.files?.[0])}/><small>PNG أو JPEG أو WebP · حتى 2 ميجابايت</small></span></>:control;
 }
 const visible=rows.filter(row=>(row.name+" "+JSON.stringify(row.data)).toLowerCase().includes(filter.toLowerCase()));
 return <section className="restaurantPanel"><header><div><h3>{config.label}</h3><p>سجلات المطعم المحفوظة · {rows.length} سجل</p></div><button className="restaurantPrimary" onClick={()=>{setUploads({});setEditing(config.singleton?rows[0]??null:null);setShowForm(true);setMessage("");}}>{config.singleton?(rows.length?"تعديل الهوية":"إعداد الهوية"):"إضافة سجل"}</button></header>
 {module==="marketing"&&<p className="restaurantNotice">يمكن حفظ الحملات وجدولتها. الإرسال الخارجي ينتظر ربط مزود القناة وتشغيل عامل الإرسال.</p>}
 {module==="remote"&&<p className="restaurantNotice">ميزانية المهمة للتخطيط فقط. تسجيل المهمة لا ينفّذ تحويلاً مالياً.</p>}
 {module==="team"&&<p className="restaurantFinePrint">ربط الموظف يتطلب بريداً مسجلاً في FOON. الدور المختار يحدد صلاحياته داخل هذا المطعم.</p>}
 {message&&<p role="status" className="restaurantNotice">{message}</p>}
 {showForm&&<form key={module+"-"+(editing?.id??"new")} className="restaurantResourceForm" onSubmit={save}><h3>{editing?"تعديل":"إضافة"} {config.label}</h3><label>الاسم<input name="name" required maxLength={180} defaultValue={editing?.name??(config.singleton?"هوية المطعم":"")}/></label><label>الحالة<select name="status" defaultValue={editing?.status??config.statuses[0]}>{config.statuses.map(status=><option key={status} value={status}>{fieldLabels[status]??status}</option>)}</select></label><label>الفرع<select name="branchId" defaultValue={editing?.branch_id??branch}><option value="">المطعم بالكامل</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>{config.fields.map(f=><label key={f.key}>{f.label}{input(f)}</label>)}<div className="restaurantFormActions"><button className="restaurantPrimary" disabled={busy}>{busy?"جارٍ الحفظ…":"حفظ البيانات"}</button><button className="restaurantOutline" type="button" onClick={()=>setShowForm(false)}>إلغاء</button></div></form>}
 <div className="restaurantListTools"><label>بحث<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="ابحث في السجلات"/></label><button className="restaurantOutline" onClick={()=>void refresh().catch(error=>setMessage(String(error.message)))}>تحديث</button></div>
 {loading?<p className="restaurantFinePrint">جارٍ تحميل البيانات…</p>:visible.length?<div className="restaurantResourceList">{visible.map(row=><article key={row.id}><header><div><b>{row.name}</b><span>{fieldLabels[row.status]??row.status}</span></div><div><button disabled={module==="purchases"&&row.status==="received"} onClick={()=>{setUploads({});setEditing(row);setShowForm(true);setMessage("");}}>تعديل</button><button disabled={busy} onClick={()=>void archive(row)}>أرشفة</button></div></header><dl>{config.fields.slice(0,4).map(f=><div key={f.key}><dt>{f.label}</dt><dd>{f.type==="ref"?(refs[f.ref!]?.find(r=>r.id===row.data[f.key])?.name??"—"):f.type==="datetime"&&row.data[f.key]?new Date(String(row.data[f.key])).toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"}):displayValue(row.data[f.key])}</dd></div>)}</dl></article>)}</div>:<p className="restaurantEmptyMessage">لا توجد سجلات مطابقة. ابدأ بإضافة أول سجل.</p>}
 </section>;
}
