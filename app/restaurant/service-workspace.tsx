"use client";
import {useEffect,useState} from "react";
import "./dining.css";
import DiningBatch from "./dining-batch";
import ReservationCalendar from "./reservation-calendar";
import TemplateEditor from "./menu/template-editor";
import ResourceManager,{operationApi} from "./resource-manager";
import {MerchantIcon} from "./merchant-icon";
const groups:Record<string,{key:string;label:string}[]>={
 printers:[{key:"printers",label:"الطابعات"},{key:"printerIntegrations",label:"إعدادات التكامل"},{key:"departments",label:"أقسام التشغيل"},{key:"departmentAssignments",label:"توجيه الأصناف"},{key:"customerInvoices",label:"فواتير العملاء"}],
 tables:[{key:"tables",label:"الطاولات"},{key:"sections",label:"أقسام الصالة"},{key:"diningBatch",label:"الإضافة الجماعية"},{key:"waiterCalls",label:"نداءات النادل"}],
 menu:[{key:"menu",label:"الأصناف"},{key:"categories",label:"التصنيفات"},{key:"menuGroups",label:"الخيارات"},{key:"menuValues",label:"قيم الخيارات"},{key:"menuImages",label:"الصور"},{key:"templates",label:"القوالب والمظهر"}],
 inventory:[{key:"inventory",label:"المخزون"},{key:"suppliers",label:"الموردون"},{key:"purchases",label:"المشتريات"}],
 team:[{key:"team",label:"إدارة الموظفين وإضافتهم"},{key:"attendance",label:"الحضور"}],
 marketing:[{key:"coupons",label:"الكوبونات"},{key:"marketing",label:"الحملات"}],
 reservations:[{key:"calendar",label:"التقويم"},{key:"reservations",label:"قائمة الحجوزات"},{key:"waitlist",label:"قائمة الانتظار"}],
 remote:[{key:"remote",label:"المهام"},{key:"remoteWorkers",label:"العاملون"},{key:"remoteMessages",label:"التواصل"},{key:"remoteDeliveries",label:"التسليمات"}],
};
export default function ServiceWorkspace({tenantId,section,branch,branches,onChanged}:{tenantId:string;section:string;branch:string;branches:{id:string;name:string}[];onChanged:()=>void}){
 const [tab,setTab]=useState(groups[section]?.[0].key??section);
 const tabs=groups[section];
 return <>{section==="team"&&<p className="restaurantFinePrint">إدارة الموظفين: افتح تبويب إدارة الموظفين وإضافتهم ثم اضغط «إضافة موظف» لتحديد الاسم والبريد والجوال والدور والفرع. الحسابات غير المسجلة تحتاج تفعيلًا قبل منحها صلاحيات.</p>}{tabs&&<div className="restaurantStatusFilters">{tabs.map(t=><button key={t.key} aria-pressed={tab===t.key} onClick={()=>setTab(t.key)}>{t.label}</button>)}</div>}{tab==="diningBatch"?<DiningBatch tenantId={tenantId} branch={branch} branches={branches} onChanged={onChanged}/>:tab==="calendar"?<ReservationCalendar tenantId={tenantId} branch={branch} branches={branches} onChanged={onChanged}/>:tab==="templates"?<TemplateEditor tenantId={tenantId}/>:<ResourceManager key={tab+"-"+branch} tenantId={tenantId} module={tab} branch={branch} branches={branches} onChanged={onChanged}/>}</>;
}
type Session={id:string;created_at:string;last_seen_at:string;expires_at:string;current:boolean};
type Customer={id:string;display_name:string|null;created_at:string};
export function UtilityWorkspace({tenantId,section}:{tenantId:string;section:string}){
 const [data,setData]=useState<{sessions?:Session[];customers?:Customer[];database?:string;migrations?:number;mailConfigured?:boolean;checkedAt?:string}>({}),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 async function refresh(){const result=await operationApi(tenantId,section);setData(result);setError("");setLoading(false);}
 useEffect(()=>{let alive=true;operationApi(tenantId,section).then(result=>{if(alive){setData(result);setLoading(false);setError("");}}).catch(error=>{if(alive){setError(String(error.message));setLoading(false);}});return()=>{alive=false;};},[tenantId,section]);
 async function revoke(session:Session){try{await operationApi(tenantId,"security","DELETE",{id:session.id});await refresh();}catch(error){setError(error instanceof Error?error.message:"تعذر إنهاء الجلسة.");}}
 return <section className="restaurantPanel"><header><div><h3>{section==="security"?"أمان الحساب والجلسات":section==="customers"?"عملاء المطعم":"صحة النظام"}</h3><p>{section==="security"?"الجلسات المرتبطة بحسابك فقط":section==="customers"?"العملاء المسجلون من واجهة هذا المطعم":"التحقق من اتصال قاعدة البيانات والخدمات"}</p></div><button className="restaurantOutline" onClick={()=>void refresh().catch(e=>setError(String(e.message)))}>تحديث</button></header>{error&&<p role="alert" className="restaurantNotice">{error}</p>}{loading?<p>جارٍ التحميل…</p>:section==="security"?<div className="restaurantResourceList">{data.sessions?.map(s=><article key={s.id}><header><b>{s.current?"الجلسة الحالية":"جلسة أخرى"}</b>{!s.current&&<button onClick={()=>void revoke(s)}>إنهاء الجلسة</button>}</header><p>آخر نشاط: {new Date(s.last_seen_at).toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"})}</p><p>تنتهي: {new Date(s.expires_at).toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"})}</p></article>)}</div>:section==="customers"?data.customers?.length?<div className="restaurantResourceList">{data.customers.map(c=><article key={c.id}><b>{c.display_name||"عميل"}</b><p>البريد الإلكتروني محفوظ بشكل خاص ولا يظهر للمتجر.</p><small>سجّل في {new Date(c.created_at).toLocaleDateString("ar-SA",{timeZone:"Asia/Riyadh"})}</small></article>)}</div>:<p className="restaurantEmptyMessage">لم يسجّل عملاء من واجهة المطعم بعد.</p>:<div className="restaurantHealthList"><div><MerchantIcon name="shield"/><b>قاعدة البيانات</b><span>{data.database==="connected"?"متصلة":"تعذر التحقق"}</span></div><div><MerchantIcon name="dashboard"/><b>الترحيلات المطبّقة</b><span>{data.migrations??"—"}</span></div><div><MerchantIcon name="bell"/><b>إعداد البريد</b><span>{data.mailConfigured?"مهيأ — يلزم التحقق من التسليم":"لم يُضبط مزود البريد بعد"}</span></div>{data.checkedAt&&<p className="restaurantFinePrint">آخر تحقق: {new Date(data.checkedAt).toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"})}</p>}</div>}</section>;
}
