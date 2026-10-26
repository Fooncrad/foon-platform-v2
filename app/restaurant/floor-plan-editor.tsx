"use client";
import {useEffect,useMemo,useRef,useState,type PointerEvent} from "react";
import {clampFloorCoordinate,defaultFloorPlan,nextFloorTableNumber,type FloorPlan} from "@/lib/restaurant/floor-plan";
import "./floor-plan-editor.css";

export default function RestaurantFloorPlan({tenantId,branch,onReservations}:{tenantId:string;branch:string;onReservations?:()=>void}){
 const [plan,setPlan]=useState<FloorPlan>(defaultFloorPlan);
 const [selected,setSelected]=useState("");
 const [message,setMessage]=useState("");
 const [saving,setSaving]=useState(false);
 const [loadedScope,setLoadedScope]=useState("");
 const loaded=loadedScope===tenantId+":"+branch;
 const [dirty,setDirty]=useState(false);
 const [zoom,setZoom]=useState(100);
 const [zoneFilter,setZoneFilter]=useState("all");
 const [drag,setDrag]=useState<string|null>(null);
 const board=useRef<HTMLDivElement>(null);
 const editRevision=useRef(0);
 const endpoint="/api/restaurant/floor-plan?branch="+encodeURIComponent(branch);
 useEffect(()=>{
  let active=true;
  // Defer resetting branch-local editor state until after the effect returns.
  // Cleanup guards both the reset and the network response against stale branches.
  void Promise.resolve().then(()=>{
   if(!active)return;
   editRevision.current+=1;
   setLoadedScope("");setPlan(defaultFloorPlan);setDirty(false);setSelected("");setMessage("");
   return fetch(endpoint,{headers:{"x-foon-tenant":tenantId},cache:"no-store"})
    .then(r=>r.ok?r.json():Promise.reject())
    .then(j=>{if(!j?.ok||!j.plan)throw Error("INVALID_FLOOR_PLAN_RESPONSE");if(active){setPlan(j.plan);setLoadedScope(tenantId+":"+branch);setDirty(false);setSelected("");setZoneFilter("all");}})
    .catch(()=>{if(active){setLoadedScope("");setMessage("تعذر تحميل مخطط الفرع؛ الحفظ معطّل لحماية الطاولات الموجودة");}});
  });
  return()=>{active=false};
 },[tenantId,endpoint]);
 const zones=useMemo(()=>Array.from(new Set(plan.tables.map(t=>t.zone).filter(Boolean))),[plan.tables]);
 const shown=zoneFilter==="all"?plan.tables:plan.tables.filter(t=>t.zone===zoneFilter);
 const active=plan.tables.find(t=>t.id===selected);
 function change(fn:(p:FloorPlan)=>FloorPlan){if(!loaded)return;editRevision.current+=1;setPlan(p=>fn(p));setDirty(true);setMessage("")}
 function add(){const id="table-"+crypto.randomUUID();change(p=>({...p,tables:[...p.tables,{id,number:nextFloorTableNumber(p.tables),seats:4,x:Math.min(2+p.tables.length%8*2,p.width-1),y:Math.min(2+Math.floor(p.tables.length/8)*2,p.height-1),zone:zones[0]||"الصالة"}]}));setSelected(id)}
 function edit(patch:Record<string,string|number>){change(p=>({...p,tables:p.tables.map(t=>t.id===selected?{...t,...patch}:t)}))}
 function moveAt(e:PointerEvent<HTMLDivElement>){if(!drag||!board.current)return;const rect=board.current.getBoundingClientRect();const x=clampFloorCoordinate(Math.round((e.clientX-rect.left)/rect.width*plan.width*2)/2,plan.width);const y=clampFloorCoordinate(Math.round((e.clientY-rect.top)/rect.height*plan.height*2)/2,plan.height);change(p=>({...p,tables:p.tables.map(t=>t.id===drag?{...t,x,y}:t)}))}
 function beginDrag(e:PointerEvent<HTMLButtonElement>,id:string){if(!loaded||e.button!==0)return;setSelected(id);setDrag(id);e.currentTarget.parentElement?.setPointerCapture(e.pointerId)}
 async function save(){if(!loaded||saving||!branch)return;const savedRevision=editRevision.current;setSaving(true);setMessage("");try{const r=await fetch(endpoint,{method:"PUT",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({plan})});if(!r.ok)throw Error();if(savedRevision===editRevision.current){setDirty(false);setMessage("تم حفظ مخطط الفرع بنجاح")}else{setMessage("تم حفظ نسخة سابقة؛ توجد تعديلات أحدث تحتاج الحفظ")}}catch{setMessage("تعذر حفظ المخطط. تحقق من الأبعاد وأرقام الطاولات المكررة وصلاحيات الفرع.")}finally{setSaving(false)}}
 return <section className="restaurantPanel foonFloorPro" dir="rtl">
 <header className="foonFloorProHeader"><div><span className="foonFloorEyebrow">FOON FLOOR PLAN</span><h2>مصمم صالة المطعم</h2><p>توزيع الطاولات على مخطط الفرع الحقيقي. الحجوزات الفعلية تدار من النظام الحالي.</p></div><div className="foonFloorHeaderActions"><span className={dirty?"foonFloorUnsaved":"foonFloorSaved"}>{!loaded?"المخطط غير محمّل":dirty?"تعديلات غير محفوظة":"آخر حالة محفوظة"}</span><button className="foonFloorPrimary" type="button" onClick={save} disabled={!loaded||!branch||saving}>{saving?"جار الحفظ…":"حفظ المخطط"}</button></div></header>
 <div className="foonFloorStats"><span><strong>{plan.tables.length}</strong> طاولة على المخطط</span><span><strong>{plan.tables.reduce((n,t)=>n+t.seats,0)}</strong> مقعد</span><span><strong>{zones.length}</strong> قسم</span><span><strong>{plan.width*plan.height}</strong> م²</span></div>
 <div className="foonFloorToolbar"><div className="foonFloorToolsLeft"><button className="foonFloorPrimary" type="button" onClick={add} disabled={!loaded||plan.tables.length>=500}>+ إضافة طاولة</button><label>الطول <input aria-label="طول الصالة بالمتر" type="number" min={2} max={200} disabled={!loaded} value={plan.width} onChange={e=>change(p=>({...p,width:Number(e.target.value)}))}/> م</label><label>العرض <input aria-label="عرض الصالة بالمتر" type="number" min={2} max={200} disabled={!loaded} value={plan.height} onChange={e=>change(p=>({...p,height:Number(e.target.value)}))}/> م</label><label>القسم <select aria-label="تصفية القسم" value={zoneFilter} onChange={e=>setZoneFilter(e.target.value)}><option value="all">كل الأقسام</option>{zones.map(z=><option key={z} value={z}>{z}</option>)}</select></label></div><div className="foonFloorZoom"><button type="button" onClick={()=>setZoom(z=>Math.max(75,z-25))} aria-label="تصغير">−</button><span>{zoom}%</span><button type="button" onClick={()=>setZoom(z=>Math.min(200,z+25))} aria-label="تكبير">+</button><button type="button" onClick={()=>setZoom(100)}>ملاءمة</button></div></div>
 <div className="foonFloorWorkspace"><div className="foonFloorStage"><div className="foonFloorViewport"><div className="foonFloorBoard" ref={board} role="group" aria-label="مخطط الطاولات، حرك الطاولة بالسحب" onPointerMove={moveAt} onPointerUp={()=>setDrag(null)} onPointerCancel={()=>setDrag(null)} style={{width:zoom+"%",minWidth:"100%",aspectRatio:`${Math.max(2,plan.width)}/${Math.max(2,plan.height)}`}}>{shown.map(t=><button type="button" key={t.id} className={"foonFloorTable"+(selected===t.id?" is-selected":"")} style={{left:`${Math.min(95,t.x/Math.max(2,plan.width)*100)}%`,top:`${Math.min(90,t.y/Math.max(2,plan.height)*100)}%`}} disabled={!loaded} onPointerDown={e=>beginDrag(e,t.id)} onClick={()=>setSelected(t.id)} onKeyDown={e=>{if(!["ArrowUp","ArrowDown","ArrowRight","ArrowLeft"].includes(e.key))return;e.preventDefault();const dx=e.key==="ArrowRight"?.5:e.key==="ArrowLeft"?-.5:0,dy=e.key==="ArrowDown"?.5:e.key==="ArrowUp"?-.5:0;change(p=>({...p,tables:p.tables.map(x=>x.id===t.id?{...x,x:clampFloorCoordinate(x.x+dx,p.width),y:clampFloorCoordinate(x.y+dy,p.height)}:x)}))}} title={t.zone+" — استخدم الأسهم للتحريك"}><b>#{t.number}</b><small>{t.seats} مقاعد</small></button>)}{shown.length===0&&<div className="foonFloorEmpty">لا توجد طاولات في هذا القسم. اختر كل الأقسام أو أضف طاولة.</div>}</div></div><div className="foonFloorStageFooter"><span>اسحب الطاولات لتغيير مواقعها • الأسهم للحركة الدقيقة • الشبكة تمثل المساحة</span><span>هذا محرر توزيع؛ لا يمثل إشغال الطاولات الحي</span></div></div>
 <aside className="foonFloorInspector"><h3>{active?"خصائص الطاولة #"+active.number:"تفاصيل المخطط"}</h3>{active?<><label>رقم الطاولة<input value={active.number} maxLength={20} onChange={e=>edit({number:e.target.value})}/></label><label>عدد المقاعد<input type="number" min={1} max={30} value={active.seats} onChange={e=>edit({seats:Number(e.target.value)})}/></label><label>القسم<input maxLength={60} value={active.zone} onChange={e=>edit({zone:e.target.value})}/></label><div className="foonFloorCoords"><label>الموقع الأفقي (م)<input type="number" step={0.5} min={0} max={plan.width} value={active.x} onChange={e=>edit({x:Number(e.target.value)})}/></label><label>الموقع الرأسي (م)<input type="number" step={0.5} min={0} max={plan.height} value={active.y} onChange={e=>edit({y:Number(e.target.value)})}/></label></div><button className="foonFloorDanger" type="button" disabled={!loaded} onClick={()=>{change(p=>({...p,tables:p.tables.filter(t=>t.id!==selected)}));setSelected("")}}>حذف الطاولة من المخطط</button></>:<p>اختر طاولة من الخريطة لتعديل رقمها وسعتها وقسمها ومكانها، أو أضف طاولة جديدة.</p>}<div className="foonFloorBooking"><h4>الحجوزات والانتظار</h4><p>تواصل مع نظام الحجز الحالي دون إنشاء حجز وهمي من المخطط أو تجاوز التوافر.</p><button type="button" onClick={onReservations} disabled={!onReservations}>فتح إدارة الحجوزات ←</button></div></aside></div>
 {message&&<p role="status" className="foonFloorMessage">{message}</p>}
 </section>
}
