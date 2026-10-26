"use client";
import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import "./section-floor-layouts.css";
const messages={"ar":["مخططات الأقسام المتعددة","اختر قسمًا موجودًا، ثم أنشئ مخططًا أو أكثر له.","جار تحميل المخططات…","المخططات المحفوظة","+ مخطط جديد","قسم غير متاح","القسم الموجود","اختر القسم","اسم المخطط","مثال: الصالة الرئيسية","الطول بالمتر","العرض بالمتر","+ إضافة طاولة","جار الحفظ","حفظ المخطط","لا توجد أقسام نشطة؛ أضف قسم صالة أولًا.","الطاولات:","المخططات:","مقاعد","رقم الطاولة","السعة","إزالة من المخطط","تعذر تحميل المخططات. تحقق من الترحيل والصلاحيات.","اختر القسم أولًا.","يجب أن تتراوح الأبعاد بين 2 و200 متر.","اختر القسم واسم المخطط.","تم حفظ المخطط.","تعذر الحفظ:","تعديل المخطط","تفعيل المخطط","إيقاف المخطط","متاح","مشغول","محجوز","تنظيف","خارج الخدمة","حالة الطاولة التشغيلية","الحالة اليدوية لا تؤكد أو تلغي الحجز الفعلي.","الحالة التشغيلية","حفظ الحالة","نشط","غير نشط"],"en":["Multiple dining floor plans","Choose an existing section and create one or more plans.","Loading plans…","Saved floor plans","+ New floor plan","Unavailable section","Existing section","Select section","Plan name","Example: Main hall","Length (m)","Width (m)","+ Add table","Saving","Save plan","No active sections. Add a dining section first.","Tables:","Plans:","seats","Table number","Capacity","Remove from plan","Could not load plans. Check migrations and permissions.","Select a section first.","Dimensions must be 2–200 metres.","Choose a section and a plan name.","Plan saved.","Save failed:","Edit layout","Activate layout","Deactivate layout","Available","Occupied","Reserved","Cleaning","Out of service","Operational table status","Manual status does not confirm or cancel an actual reservation.","Operational status","Save status","Active","Inactive"],"fr":["Plans de salle multiples","Choisissez une section existante et créez un ou plusieurs plans.","Chargement des plans…","Plans enregistrés","+ Nouveau plan","Section indisponible","Section existante","Choisir une section","Nom du plan","Exemple : Salle principale","Longueur (m)","Largeur (m)","+ Ajouter une table","Enregistrement","Enregistrer","Aucune section active. Ajoutez une section d'abord.","Tables :","Plans :","places","Numéro de table","Capacité","Retirer du plan","Impossible de charger les plans. Vérifiez la migration et les droits.","Choisissez d'abord une section.","Les dimensions doivent être entre 2 et 200 mètres.","Choisissez une section et un nom.","Plan enregistré.","Erreur d'enregistrement :","Modifier le plan","Activer le plan","Désactiver le plan","Disponible","Occupée","Réservée","Nettoyage","Hors service","État opérationnel de la table","L'état manuel ne confirme ni n'annule une réservation réelle.","État opérationnel","Enregistrer l'état","Actif","Inactif"]} as const;
import {defaultFloorPlan,nextFloorTableNumber,nextFloorTablePosition,type FloorPlan} from "@/lib/restaurant/floor-plan";
import {latinDigits,englishNumber} from "@/lib/restaurant/floor-layout-numbers";
type Section={id:string;name:string;status?:string};
type Layout={id:string;sectionId:string;name:string;plan:FloorPlan;active:boolean};
type TableOperation={layoutId:string;tableId:string;status:string};
type RegisteredTable={id:string;name:string;status:string;sectionId:string};
type FloorLink={layoutId:string;tableId:string;diningTableId:string};
// Remount on tenant/branch changes: an in-flight save must never paint a prior
// branch's layouts or success state into the newly selected workspace.
export default function SectionFloorLayouts(props:{tenantId:string;branch:string}){
 return <SectionFloorLayoutsScoped key={props.tenantId+":"+props.branch} {...props}/>;
}
function SectionFloorLayoutsScoped({tenantId,branch}:{tenantId:string;branch:string}){
 const language=useUiLanguage();const tr=(key:number)=>messages[language][key];
 const [sections,setSections]=useState<Section[]>([]),[layouts,setLayouts]=useState<Layout[]>([]),[operations,setOperations]=useState<TableOperation[]>([]),[registeredTables,setRegisteredTables]=useState<RegisteredTable[]>([]),[links,setLinks]=useState<FloorLink[]>([]);
 const [legacyPlan,setLegacyPlan]=useState<FloorPlan|null>(null);
 const [current,setCurrent]=useState(""),[sectionId,setSectionId]=useState(""),[name,setName]=useState(""),[plan,setPlan]=useState<FloorPlan>(defaultFloorPlan);
 const [zoom,setZoom]=useState(100);
 const [dragging,setDragging]=useState<string|null>(null);const boardRef=useRef<HTMLDivElement>(null);
 const [selected,setSelected]=useState(""),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 const url="/api/restaurant/floor-plan-layouts?branch="+encodeURIComponent(branch);
 useEffect(()=>{let live=true;void Promise.resolve().then(async()=>{if(!live)return;setLoading(true);setSections([]);setLayouts([]);setLegacyPlan(null);setCurrent("");setSectionId("");setName("");setPlan(defaultFloorPlan);setSelected("");setMessage("");
  const headers={"x-foon-tenant":tenantId};
  try{
   // Load the existing dining sections first: missing newer migration tables must not hide them.
   const response=await fetch(url+"&view=sections",{headers,cache:"no-store"});
   const result=await response.json();if(!response.ok||!result.ok)throw Error(String(result.code||"SECTIONS_UNAVAILABLE"));
   if(live){setSections(result.sections||[]);setSectionId((result.sections||[]).find((x:Section)=>x.status==="active")?.id||"")}
  }catch(error){if(live)setMessage((language==="ar"?"تعذر تحميل أقسام الصالة المسجلة: ":language==="en"?"Could not load existing dining sections: ":"Impossible de charger les sections : ")+String(error instanceof Error?error.message:error));}
  try{
   const response=await fetch(url,{headers,cache:"no-store"});const data=await response.json();
   if(!response.ok||!data.ok)throw Error(String(data.code||"LAYOUTS_UNAVAILABLE"));
   if(live){setLayouts(data.layouts||[]);setLegacyPlan(data.legacyPlan||null);setOperations(data.operations||[]);setRegisteredTables(data.registeredTables||[]);setLinks(data.links||[])}
  }catch(error){if(live)setMessage((language==="ar"?"الأقسام محفوظة، لكن بيانات المخططات غير متاحة. تأكد من الترحيلات 0306 و0307 و0308: ":language==="en"?"Sections are available, but floor plans could not load. Check migrations 0306–0308: ":"Sections disponibles, mais les plans sont indisponibles. Vérifiez les migrations 0306–0308 : ")+String(error instanceof Error?error.message:error));}
  finally{if(live)setLoading(false)}
 });return()=>{live=false}},[tenantId,url,language]);
 function openLayout(id:string){if(id===""){setCurrent("");setName("");setPlan(defaultFloorPlan);setSelected("");return}const l=layouts.find(x=>x.id===id);if(!l)return;setCurrent(id);setName(l.name);setSectionId(l.sectionId);setPlan(l.plan);setSelected("");setMessage("")}
 function importLegacy(){if(!legacyPlan||!legacyPlan.tables.length||current||plan.tables.length)return;setPlan(structuredClone(legacyPlan));setName(language==="ar"?"المخطط السابق":language==="en"?"Legacy floor plan":"Ancien plan");setSelected("");setMessage(language==="ar"?"تم تحميل نسخة من المخطط السابق؛ اختر القسم ثم اضغط حفظ المخطط لإنشاء نسخة مستقلة. المخطط الأصلي محفوظ.":language==="en"?"Legacy floor plan copied. Select a section and save as a new plan; the original remains unchanged.":"Ancien plan copié. Sélectionnez une section et enregistrez une nouvelle copie ; l'original reste intact.")}
 function addTable(){if(!sectionId)return setMessage(tr(23));const id="table-"+crypto.randomUUID();setPlan(p=>({...p,tables:[...p.tables,{id,number:nextFloorTableNumber(p.tables),seats:4,...nextFloorTablePosition(p),zone:sections.find(s=>s.id===sectionId)?.name||"الصالة"}]}));setSelected(id)}
 function moveTable(e:ReactPointerEvent<HTMLDivElement>){if(!dragging||!boardRef.current)return;const r=boardRef.current.getBoundingClientRect();if(r.width===0||r.height===0)return;const x=Math.max(0,Math.min(plan.width-0.01,Math.round((e.clientX-r.left)/r.width*plan.width*2)/2));const y=Math.max(0,Math.min(plan.height-0.01,Math.round((e.clientY-r.top)/r.height*plan.height*2)/2));setPlan(p=>({...p,tables:p.tables.map(t=>t.id===dragging?{...t,x,y}:t)}))}
 const active=plan.tables.find(t=>t.id===selected);
 const operationStatus=(tableId:string)=>{const link=links.find(x=>x.layoutId===current&&x.tableId===tableId);const real=registeredTables.find(x=>x.id===link?.diningTableId);return real&&["occupied","reserved","inactive"].includes(real.status)?(real.status==="inactive"?"out_of_service":real.status):operations.find(o=>o.layoutId===current&&o.tableId===tableId)?.status||"available"};
 const statusColor:Record<string,string>={available:"#e0f4e9",occupied:"#fee2e2",reserved:"#e2e9ff",cleaning:"#fff1cb",out_of_service:"#e4e4e7"};
 const statusLabel:Record<string,number>={available:31,occupied:32,reserved:33,cleaning:34,out_of_service:35};
 function tableEdit(patch:Record<string,number|string>){setPlan(p=>({...p,tables:p.tables.map(t=>t.id===selected?{...t,...patch}:t)}))}
 function localDuplicate():string|null{
 const normalize=(v:string)=>/^\d+$/.test(v.trim())?String(BigInt(v.trim())):v.trim().toLowerCase();
 const currentNumbers=new Set(plan.tables.map(t=>normalize(t.number)));
 if(currentNumbers.size!==plan.tables.length){const seen=new Set<string>();for(const table of plan.tables){const number=normalize(table.number);if(seen.has(number))return table.number;seen.add(number)}}
 for(const layout of layouts)if(layout.sectionId===sectionId&&layout.id!==current)
  for(const t of layout.plan.tables)if(currentNumbers.has(normalize(t.number)))return t.number;
 return null;
}
 async function save(){const duplicate=localDuplicate();if(duplicate!==null)return setMessage((language==="ar"?"رقم الطاولة مستخدم بالفعل في القسم: ":language==="fr"?"Numéro de table déjà utilisé dans cette section : ":"Table number already used in this section: ")+duplicate);if(!Number.isFinite(plan.width)||!Number.isFinite(plan.height)||plan.width<2||plan.height<2||plan.width>200||plan.height>200)return setMessage(tr(24));if(!sectionId||!name.trim())return setMessage(tr(25));setSaving(true);setMessage("");try{const r=await fetch(url,{method:current?"PUT":"POST",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({...(current?{id:current}:{}),sectionId,name,plan})});const data=await r.json();if(!r.ok)throw Error(data.code==="SECTION_TABLE_NUMBER_EXISTS"?(language==="ar"?"رقم الطاولة مستخدم بالفعل في القسم: ":language==="fr"?"Numéro déjà utilisé dans cette section : ":"Table number already used in this section: ")+String(data.number||""):data.code||"SAVE_FAILED");const id=current||data.id;setLayouts(ls=>{const next=ls.filter(l=>l.id!==id);return [...next,{id,sectionId,name,plan,active:ls.find(l=>l.id===id)?.active??false}]});setCurrent(id);setMessage(tr(26))}catch(e){setMessage(tr(27)+" "+String(e instanceof Error?e.message:e))}finally{setSaving(false)}}
 async function operation(action:"activate"|"tableStatus"|"linkTable",values:Record<string,unknown>){if(!current||saving)return;setSaving(true);setMessage("");try{const r=await fetch(url,{method:"PATCH",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({id:current,action,...values})});const d=await r.json();if(!r.ok)throw Error(String(d.code||"OPERATION_SAVE_FAILED"));if(action==="linkTable")setLinks(ls=>[...ls.filter(x=>!(x.layoutId===current&&x.tableId===selected)),...(values.diningTableId?[{layoutId:current,tableId:selected,diningTableId:String(values.diningTableId)}]:[])]);else if(action==="activate")setLayouts(ls=>ls.map(l=>l.id===current?{...l,active:Boolean(values.active)}:l));else setOperations(os=>[...os.filter(x=>!(x.layoutId===current&&x.tableId===selected)),{layoutId:current,tableId:selected,status:String(values.status)}]);setMessage(tr(26))}catch(e){setMessage(tr(27)+" "+String(e instanceof Error?e.message:e))}finally{setSaving(false)}}
 return <section className="restaurantPanel foonFloorWorkspace" dir={language==="ar"?"rtl":"ltr"}>
 <header className="foonFloorTitle">
  <div><span className="foonFloorEyebrow">{language==="ar"?"العمل اليومي / إدارة الصالة":language==="en"?"Daily operations / Dining room":"Opérations quotidiennes / Salle"}</span><h2>{language==="ar"?"الطاولات ومخططات الصالات":language==="en"?"Tables & floor plans":"Tables et plans de salle"}</h2><p>{tr(1)}</p></div>
  <div className="foonFloorSummary"><span>{tr(17)} <strong dir="ltr">{layouts.length}</strong></span><span>{tr(16)} <strong dir="ltr">{plan.tables.length}</strong></span></div>
 </header>
 {loading?<p role="status">{tr(2)}</p>:<div className="foonFloorGrid">
  <div className="foonFloorMain">
   <div className="foonFloorCard foonFloorCanvasCard">
    <div className="foonFloorCanvasHeader"><div><h3>{language==="ar"?"مخطط الصالة":language==="en"?"Floor plan":"Plan de salle"}</h3><p>{language==="ar"?"اسحب الطاولات لترتيبها، أو اختر طاولة لتعديل تفاصيلها.":language==="en"?"Drag tables to arrange them, or select a table to edit details.":"Déplacez les tables ou sélectionnez-en une pour modifier ses détails."}</p></div>
     <button type="button" className="foonFloorButton foonFloorPrimary" onClick={addTable} disabled={!sections.some(x=>x.id===sectionId&&x.status==="active")||plan.tables.length>=500}>{tr(12)}</button>
    </div>
    <div className="foonFloorControls">
     <label>{tr(6)}<select value={sectionId} onChange={e=>setSectionId(e.target.value)}><option value="">{tr(7)}</option>{sections.map(x=><option key={x.id} value={x.id} disabled={x.status!=="active"}>{x.name}{x.status!=="active"?" ("+(language==="ar"?"غير نشط":language==="en"?"Inactive":"Inactif")+")":""}</option>)}</select></label>
     <label>{tr(8)}<input maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder={tr(9)}/></label>
     <div className="foonFloorZoom"><button type="button" aria-label={language==="ar"?"تصغير":language==="en"?"Zoom out":"Dézoomer"} onClick={()=>setZoom(v=>Math.max(75,v-25))}>−</button><span dir="ltr">{zoom}%</span><button type="button" aria-label={language==="ar"?"تكبير":language==="en"?"Zoom in":"Zoomer"} onClick={()=>setZoom(v=>Math.min(200,v+25))}>+</button><button type="button" onClick={()=>setZoom(100)}>{language==="ar"?"ملاءمة":language==="en"?"Fit":"Ajuster"}</button></div>
    </div>
    <div className="foonFloorCanvasViewport"><div className="foonFloorCanvas" ref={boardRef} onPointerMove={moveTable} onPointerUp={()=>setDragging(null)} onPointerCancel={()=>setDragging(null)} style={{width:zoom+"%",minWidth:"100%",aspectRatio:`${Math.max(2,plan.width)}/${Math.max(2,plan.height)}`}}>
     <span className="foonFloorCanvasLabel">{language==="ar"?"معاينة المخطط · اسحب لترتيب الطاولات":language==="en"?"Plan preview · drag to arrange tables":"Aperçu · déplacez les tables"}</span>
     {plan.tables.map(t=><button className={"foonFloorTableNode"+(selected===t.id?" is-selected":"")} type="button" key={t.id} onClick={()=>setSelected(t.id)} onPointerDown={e=>{if(e.button!==0)return;setSelected(t.id);setDragging(t.id);e.currentTarget.parentElement?.setPointerCapture(e.pointerId)}} style={{left:`${Math.min(96,t.x/Math.max(plan.width,2)*100)}%`,top:`${Math.min(92,t.y/Math.max(plan.height,2)*100)}%`,background:statusColor[operationStatus(t.id)]||"#eaf7f3"}} aria-label={`#${t.number} · ${t.seats} ${tr(18)} · ${tr(statusLabel[operationStatus(t.id)]??31)}`}><strong dir="ltr">#{t.number}</strong><small>{t.seats} {tr(18)}</small><small>{tr(statusLabel[operationStatus(t.id)]??31)}</small></button>)}
    </div></div>
    <div className="foonFloorCanvasFoot"><span>{tr(37)}</span><span>{plan.tables.length} {language==="ar"?"طاولة":language==="en"?"tables":"tables"}</span></div>
   </div>
   <div className="foonFloorCard foonFloorActions">
    <label>{tr(10)}<input dir="ltr" lang="en" type="number" min={2} max={200} value={plan.width} onChange={e=>setPlan(p=>({...p,width:englishNumber(e.target.value)}))}/></label>
    <label>{tr(11)}<input dir="ltr" lang="en" type="number" min={2} max={200} value={plan.height} onChange={e=>setPlan(p=>({...p,height:englishNumber(e.target.value)}))}/></label>
    {current&&<button type="button" className="foonFloorButton" onClick={()=>openLayout(current)}>{tr(28)}</button>}
    {current&&<button type="button" className="foonFloorButton" disabled={saving} onClick={()=>operation("activate",{active:!layouts.find(l=>l.id===current)?.active})}>{layouts.find(l=>l.id===current)?.active?tr(30):tr(29)}</button>}
    <button type="button" className="foonFloorButton foonFloorPrimary" disabled={saving||!sections.some(x=>x.id===sectionId&&x.status==="active")} onClick={save}>{saving?tr(13):tr(14)}</button>
   </div>
  </div>
  <aside className="foonFloorAside">
   <section className="foonFloorCard foonFloorAsideCard"><h3>{language==="ar"?"المخططات والأقسام":language==="en"?"Floor plans & sections":"Plans et sections"}</h3>
    <label>{tr(3)}<select value={current} onChange={e=>openLayout(e.target.value)}><option value="">{tr(4)}</option>{layouts.map(l=><option key={l.id} value={l.id}>{l.name} — {sections.find(x=>x.id===l.sectionId)?.name||tr(5)}</option>)}</select></label>
    {legacyPlan&&legacyPlan.tables.length>0&&!current&&plan.tables.length===0&&<button type="button" className="foonFloorButton" onClick={importLegacy}>{language==="ar"?"نسخ المخطط القديم":language==="en"?"Copy legacy plan":"Copier l'ancien plan"}</button>}
    <div className="foonFloorStat"><span>{language==="ar"?"الأقسام":language==="en"?"Sections":"Sections"}</span><strong dir="ltr">{sections.length}</strong></div>
    <div className="foonFloorStat"><span>{language==="ar"?"الطاولات":language==="en"?"Tables":"Tables"}</span><strong dir="ltr">{plan.tables.length}</strong></div>
    {current&&<div className="foonFloorActivation">{layouts.find(l=>l.id===current)?.active?tr(40):tr(41)}</div>}
    {!sections.length&&<p role="alert">{tr(15)}</p>}
   </section>
   <section className="foonFloorCard foonFloorAsideCard"><h3>{language==="ar"?"تفاصيل الطاولة":language==="en"?"Table details":"Détails de la table"}</h3>
    {active?<div className="foonFloorFields">
     <label>{tr(19)}<input dir="ltr" lang="en" inputMode="numeric" value={active.number} onChange={e=>tableEdit({number:latinDigits(e.target.value)})}/></label>
     <label>{tr(20)}<input dir="ltr" lang="en" type="number" min={1} max={30} value={active.seats} onChange={e=>tableEdit({seats:englishNumber(e.target.value)})}/></label>
     <div className="foonFloorCoords"><label>X<input dir="ltr" lang="en" type="number" step={0.5} min={0} max={plan.width} value={active.x} onChange={e=>tableEdit({x:englishNumber(e.target.value)})}/></label><label>Y<input dir="ltr" lang="en" type="number" step={0.5} min={0} max={plan.height} value={active.y} onChange={e=>tableEdit({y:englishNumber(e.target.value)})}/></label></div>
     {current&&<label>{language==="ar"?"الطاولة المسجلة":language==="en"?"Registered table":"Table enregistrée"}<select disabled={saving} value={links.find(l=>l.layoutId===current&&l.tableId===selected)?.diningTableId||""} onChange={e=>void operation("linkTable",{tableId:selected,diningTableId:e.target.value||null})}><option value="">{language==="ar"?"غير مرتبطة":language==="en"?"Unlinked":"Non associée"}</option>{registeredTables.filter(x=>x.sectionId===sectionId&&x.status!=="inactive").map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
     {current&&<label>{tr(36)}<select disabled={saving} value={operations.find(o=>o.layoutId===current&&o.tableId===selected)?.status||"available"} onChange={e=>void operation("tableStatus",{tableId:selected,status:e.target.value})}><option value="available">{tr(31)}</option><option value="occupied">{tr(32)}</option><option value="reserved">{tr(33)}</option><option value="cleaning">{tr(34)}</option><option value="out_of_service">{tr(35)}</option></select></label>}
     <button type="button" className="foonFloorButton foonFloorDanger" onClick={()=>{setPlan(p=>({...p,tables:p.tables.filter(t=>t.id!==selected)}));setSelected("")}}>{tr(21)}</button>
    </div>:<p className="foonFloorHint">{language==="ar"?"اختر طاولة من المخطط لتعديل تفاصيلها.":language==="en"?"Select a table on the plan to edit its details.":"Sélectionnez une table pour modifier ses détails."}</p>}
   </section>
  </aside>
 </div>}
 {message&&<p className="foonFloorMessage" role="status">{message}</p>}
 </section>
}
