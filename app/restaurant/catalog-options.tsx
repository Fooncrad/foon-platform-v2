"use client";
import styles from "./catalog-dialog.module.css";
import {useRef,useState} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
type Value={id:string;name_ar:string;price_delta:number;stock_quantity:number|null};
type Group={id:string;name_ar:string;required:boolean;selection_type:string;values:Value[]};
const presets=[
 ["اللون","Color","Couleur"],["المقاس","Size","Taille"],["الحجم","Volume","Volume"],
 ["الوزن (كيلو / جرام)","Weight (kg / g)","Poids (kg / g)"],["الطول (متر / سم)","Length (m / cm)","Longueur (m / cm)"],
 ["العرض (متر / سم)","Width (m / cm)","Largeur (m / cm)"],["الارتفاع (سم)","Height (cm)","Hauteur (cm)"],
 ["العبوة / القطعة","Pack / piece","Paquet / pièce"],["السعة (لتر / مل)","Capacity (L / ml)","Capacité (L / ml)"],
 ["نوع الخدمة","Service type","Type de service"],["الخامة","Material","Matière"]
];
export default function CatalogOptions({tenantId,product,name,activity}:{tenantId:string;product:string;name:string;activity?:string}){
 const language=useUiLanguage(),i=language==="ar"?0:language==="en"?1:2;
 const l=(ar:string,en:string,fr:string)=>[ar,en,fr][i];
 const dialog=useRef<HTMLDialogElement>(null);
 const [groups,setGroups]=useState<Group[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [selected,setSelected]=useState(""),[groupName,setGroupName]=useState(""),[en,setEn]=useState(""),[fr,setFr]=useState(""),[required,setRequired]=useState(true),[multiple,setMultiple]=useState(false),[max,setMax]=useState("2");
 const [value,setValue]=useState(""),[valueEn,setValueEn]=useState(""),[valueFr,setValueFr]=useState(""),[price,setPrice]=useState("0"),[stock,setStock]=useState("");
 async function load(){const r=await fetch("/api/restaurant/activity-catalog/options?product="+product,{headers:{"x-foon-tenant":tenantId},cache:"no-store"});if(!r.ok)throw Error();const d=await r.json();setGroups(d.groups);setSelected(old=>d.groups.some((g:Group)=>g.id===old)?old:d.groups[0]?.id??"")}
 async function save(data:Record<string,unknown>){setBusy(true);setError("");try{const r=await fetch("/api/restaurant/activity-catalog/options",{method:"POST",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({product,...data})});if(!r.ok){const d=await r.json();throw Error(d.code)}await load();return true}catch(e){setError(l("تعذر الحفظ. تحقق من البيانات وصلاحيات الباقة.","Save failed. Check your input and plan permissions.","Échec. Vérifiez les données et votre forfait.")+" "+(e instanceof Error?e.message:""));return false}finally{setBusy(false)}}
 const suggested=activity==="clothing"?[0,1,4,10]:activity==="grocery"?[3,7,8]:activity==="perfume"?[8,2]:["laundry","carwash","salon","automotive","publicworks"].includes(activity??"")?[9,3,4,5]:[0,1,2,3,4,5,6,7,8,10];
 return <><button type="button" onClick={()=>{dialog.current?.showModal();void load().catch(()=>setError(l("تعذر تحميل الخيارات","Unable to load options","Chargement impossible")))}}>{l("المتغيرات ووحدات البيع","Variants & selling units","Variantes et unités")}</button><dialog className={styles.dialog} ref={dialog} style={{width:"min(760px,calc(100vw - 24px))",maxWidth:"100%",maxHeight:"90dvh",overflow:"auto",border:"1px solid #8885",borderRadius:20,padding:20,background:"var(--panel-bg, #fff)",color:"var(--text-color, #172033)"}} dir={i===0?"rtl":"ltr"}>
 <header style={{display:"flex",justifyContent:"space-between",gap:12}}><h2>{name}</h2><button type="button" onClick={()=>dialog.current?.close()} aria-label={l("إغلاق","Close","Fermer")}>×</button></header>
 <p>{l("أضف خيارات قابلة للاختيار مع فرق السعر ومخزون مستقل. أدخل الوحدة ضمن القيمة، مثل 0.5 كيلو أو 250 مل. السعر الأساسي مع فرق سعر الخيار يحدد سعر العبوة المختارة.","Add selectable options with price adjustments and separate stock. Include the unit in each value, such as 0.5 kg or 250 ml. Base price plus the option adjustment determines the selected pack price.","Ajoutez des choix avec supplément et stock distinct. Indiquez l’unité : 0.5 kg ou 250 ml. Le prix de base et le supplément déterminent le prix du conditionnement.")}</p>
 <form onSubmit={async e=>{e.preventDefault();if(await save({action:"group",name:groupName,nameEn:en,nameFr:fr,type:multiple?"multiple":"single",required,max:Number(max)})){setGroupName("");setEn("");setFr("")}}} style={{display:"grid",gap:12}}>
 <label>{l("قالب حسب النشاط","Activity template","Modèle par activité")}<select aria-label={l("قالب حسب النشاط","Activity template","Modèle par activité")} defaultValue="" onChange={e=>{const p=presets[Number(e.target.value)];if(p){setGroupName(p[0]);setEn(p[1]);setFr(p[2])}}}><option value="" disabled>{l("اختر أو أدخل اسمًا مخصصًا","Choose or enter a custom name","Choisissez ou personnalisez")}</option>{[...suggested,...presets.map((_,n)=>n).filter(n=>!suggested.includes(n))].map(n=><option key={n} value={n}>{presets[n][i]}</option>)}</select></label>
 <label>{l("اسم المجموعة بالعربية","Group name in Arabic","Nom du groupe en arabe")}<input required maxLength={180} value={groupName} onChange={e=>setGroupName(e.target.value)}/></label>
 <label>English<input maxLength={180} value={en} onChange={e=>setEn(e.target.value)}/></label><label>Français<input maxLength={180} value={fr} onChange={e=>setFr(e.target.value)}/></label>
 <label><input type="checkbox" checked={required} onChange={e=>setRequired(e.target.checked)}/>{l("اختيار إلزامي","Required choice","Choix obligatoire")}</label><label><input type="checkbox" checked={multiple} onChange={e=>setMultiple(e.target.checked)}/>{l("اختيارات متعددة","Multiple choices","Choix multiples")}</label>
 {multiple&&<label>{l("أقصى عدد للاختيارات","Maximum selections","Nombre maximal")}<input type="number" min={1} max={50} required dir="ltr" lang="en" value={max} onChange={e=>setMax(e.target.value)}/></label>}
 <button disabled={busy} type="submit">{l("إضافة مجموعة","Add group","Ajouter un groupe")}</button></form>
 {groups.length>0&&<form onSubmit={async e=>{e.preventDefault();if(await save({action:"value",group:selected,name:value,nameEn:valueEn,nameFr:valueFr,price:Number(price),stock:stock===""?null:Number(stock)})){setValue("");setValueEn("");setValueFr("");setPrice("0");setStock("")}}} style={{display:"grid",gap:12,marginTop:24}}>
 <label>{l("المجموعة","Group","Groupe")}<select aria-label={l("المجموعة","Group","Groupe")} value={selected} onChange={e=>setSelected(e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.name_ar}</option>)}</select></label>
 <label>{l("القيمة بالعربية (مثال: 1 كيلو)","Arabic value (e.g. 1 kg)","Valeur arabe (ex. 1 kg)")}<input required maxLength={180} value={value} onChange={e=>setValue(e.target.value)}/></label>
 <label>English<input maxLength={180} value={valueEn} onChange={e=>setValueEn(e.target.value)}/></label><label>Français<input maxLength={180} value={valueFr} onChange={e=>setValueFr(e.target.value)}/></label>
 <label>{l("فرق السعر","Price adjustment","Supplément")}<input required type="number" min="0" max="9999999999" step="0.01" lang="en" dir="ltr" value={price} onChange={e=>setPrice(e.target.value)}/></label>
 <label>{l("مخزون العبوات (فارغ = غير محدود)","Pack stock (blank = unlimited)","Stock de paquets (vide = illimité)")}<input type="number" min="0" max="999999999" step="1" lang="en" dir="ltr" value={stock} onChange={e=>setStock(e.target.value)}/></label><button disabled={busy} type="submit">{l("إضافة قيمة","Add value","Ajouter une valeur")}</button></form>}
 {groups.map(g=><section key={g.id} style={{borderTop:"1px solid #8885",marginTop:20,paddingTop:12}}><h3>{g.name_ar}</h3><p>{g.required?l("إلزامي","Required","Obligatoire"):l("اختياري","Optional","Facultatif")}</p>{g.values.length===0&&<p role="status">{l("أضف قيمة قبل إتاحة المنتج للطلب.","Add a value before offering this item for ordering.","Ajoutez une valeur avant de proposer cet article.")}</p>}{g.values.map(v=><div key={v.id} style={{display:"flex",flexWrap:"wrap",gap:12,marginBlock:8}}><span>{v.name_ar} · +{Number(v.price_delta).toFixed(2)} · {v.stock_quantity??"∞"}</span><button disabled={busy} type="button" onClick={()=>void save({action:"deleteValue",id:v.id,group:g.id})}>{l("حذف القيمة","Delete value","Supprimer la valeur")}</button></div>)}<button disabled={busy} type="button" onClick={()=>void save({action:"deleteGroup",id:g.id})}>{l("حذف المجموعة","Delete group","Supprimer le groupe")}</button></section>)}
 {error&&<p role="alert">{error}</p>}
 </dialog></>;
}
