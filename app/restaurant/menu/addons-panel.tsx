"use client";
import {useEffect,useRef,useState} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import {quoteCsvCell} from "@/lib/security/csv-export";

type Data={itemId?:string;groupId?:string;nameEn?:string|null;nameFr?:string|null;selectionType?:string;requiredFlag?:string;minSelect?:number;maxSelect?:number;priceDelta?:number;stockQuantity?:number|null;sortOrder?:number;imageUrl?:string|null};
type Resource={id:string;name:string;status:string;version:string|number;data:Data};
type Item={id:string;name:string};
type DraftGroup={name:string;nameEn:string;nameFr:string;required:boolean;multiple:boolean;min:string;max:string;sort:string};
type DraftValue={name:string;nameEn:string;nameFr:string;price:string;stock:string;sort:string;imageUrl:string};
const emptyGroup:DraftGroup={name:"",nameEn:"",nameFr:"",required:false,multiple:false,min:"0",max:"1",sort:"0"};
const emptyValue:DraftValue={name:"",nameEn:"",nameFr:"",price:"0",stock:"",sort:"0",imageUrl:""};
const id36=/^[a-f0-9-]{36}$/i;
function decodeCsv(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
  else if(c===","&&!quoted){row.push(cell.trim());cell=""}
  else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell=""}
  else cell+=c;
 }
 if(quoted)throw Error("INVALID_CSV_QUOTES");
 row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 return rows;
}
function downloadCsv(rows:unknown[][],filename:string){

 const csv="\uFEFF"+rows.map(row=>row.map(quoteCsvCell).join(",")).join("\r\n");
 const href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const element=document.createElement("a");element.href=href;element.download=filename;element.click();URL.revokeObjectURL(href);
}
export default function MenuAddonsPanel({tenantId}:{tenantId:string}){
 const language=useUiLanguage(),tr=(ar:string,en:string,fr:string)=>language==="ar"?ar:language==="en"?en:fr;
 const [items,setItems]=useState<Item[]>([]),[groups,setGroups]=useState<Resource[]>([]),[values,setValues]=useState<Resource[]>([]);
 const [itemId,setItemId]=useState(""),[groupId,setGroupId]=useState(""),[query,setQuery]=useState("");
 const [draftGroup,setDraftGroup]=useState<DraftGroup>(emptyGroup),[draftValue,setDraftValue]=useState<DraftValue>(emptyValue);
 const [editingGroup,setEditingGroup]=useState<string|null>(null),[editingValue,setEditingValue]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(""),[error,setError]=useState("");
 const inputRef=useRef<HTMLInputElement>(null);
 const headers={"x-foon-tenant":tenantId};
 async function api(module:"menuGroups"|"menuValues",method:"POST"|"PATCH"|"DELETE",body:Record<string,unknown>){
  const response=await fetch("/api/restaurant/operations/"+module,{method,headers:{...headers,"content-type":"application/json"},body:JSON.stringify(body)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw Error(result.code||"ADDON_SAVE_FAILED");
  return result as {ok:boolean;id:string};
 }
 async function refresh(){
  const paths=["/api/restaurant/menu/items","/api/restaurant/operations/menuGroups","/api/restaurant/operations/menuValues"];
  const answers=await Promise.all(paths.map(path=>fetch(path,{headers,cache:"no-store"})));
  if(answers.some(response=>!response.ok))throw Error("ADDONS_UNAVAILABLE");
  const [menu,options,choices]=await Promise.all(answers.map(response=>response.json()));
  if(!Array.isArray(menu.items)||!Array.isArray(options.resources)||!Array.isArray(choices.resources))throw Error("INVALID_ADDONS_RESPONSE");
  setItems(menu.items);setGroups(options.resources);setValues(choices.resources);
  setItemId(current=>menu.items.some((item:Item)=>item.id===current)?current:menu.items[0]?.id??"");
 }
 useEffect(()=>{let active=true;async function start(){try{await refresh()}catch{if(active)setError(tr("تعذر تحميل الإضافات","Unable to load add-ons","Chargement impossible"))}finally{if(active)setLoading(false)}}void start();return()=>{active=false}},[tenantId]); // eslint-disable-line react-hooks/exhaustive-deps
 const itemGroups=groups.filter(g=>g.data.itemId===itemId&&g.status!=="archived").sort((a,b)=>Number(a.data.sortOrder??0)-Number(b.data.sortOrder??0)||a.name.localeCompare(b.name));
 const visibleGroups=itemGroups.filter(g=>(g.name+" "+String(g.data.nameEn??"")+" "+String(g.data.nameFr??"")+" "+values.filter(v=>v.data.groupId===g.id).map(v=>v.name).join(" ")).toLowerCase().includes(query.toLowerCase()));
 const activeGroup=itemGroups.some(g=>g.id===groupId)?groupId:itemGroups[0]?.id??"";
 const nameOfItem=(id:string)=>items.find(item=>item.id===id)?.name??id;
 const fields={display:"grid",gap:9,minWidth:0} as const;
 async function perform(task:()=>Promise<unknown>,success:string){
  setBusy(true);setError("");setMessage("");
  try{await task();await refresh();setMessage(success);return true}
  catch(e){setError(tr("فشلت العملية: ","Operation failed: ","Échec : ")+(e instanceof Error?e.message:"UNKNOWN"));return false}
  finally{setBusy(false)}
 }
 async function storeGroup(){
  const type=draftGroup.multiple?"multiple":"single";
  const min=Number(draftGroup.min),max=type==="single"?1:Number(draftGroup.max),sortOrder=Number(draftGroup.sort);
  if(!draftGroup.name.trim()||!Number.isInteger(min)||!Number.isInteger(max)||min<0||min>max||draftGroup.required&&min<1||!Number.isInteger(sortOrder)||sortOrder<0){setError(tr("تحقق من اسم المجموعة وحدود الاختيارات","Check group name and selection limits","Vérifiez le groupe et les limites"));return}
  const existing=groups.find(g=>g.id===editingGroup);
  if(await perform(()=>api("menuGroups",existing?"PATCH":"POST",{...(existing?{id:existing.id,version:existing.version}:{}),name:draftGroup.name.trim(),status:existing?.status??"active",data:{itemId,selectionType:type,requiredFlag:draftGroup.required?"yes":"no",minSelect:min,maxSelect:max,sortOrder,nameEn:draftGroup.nameEn.trim(),nameFr:draftGroup.nameFr.trim()}}),tr("تم حفظ المجموعة","Group saved","Groupe enregistré"))){setEditingGroup(null);setDraftGroup(emptyGroup)}
 }
 async function storeValue(){
  if(!activeGroup||!draftValue.name.trim()||draftValue.name.length>180||!Number.isFinite(Number(draftValue.price))||Number(draftValue.price)<0||Number(draftValue.price)>1000000||draftValue.stock!==""&&(!Number.isFinite(Number(draftValue.stock))||Number(draftValue.stock)<0)||!Number.isInteger(Number(draftValue.sort))||Number(draftValue.sort)<0){setError(tr("تحقق من بيانات الإضافة","Check add-on values","Vérifiez l’option"));return}
  const existing=values.find(v=>v.id===editingValue);
  if(await perform(()=>api("menuValues",existing?"PATCH":"POST",{...(existing?{id:existing.id,version:existing.version}:{}),name:draftValue.name.trim(),status:existing?.status??"active",data:{groupId:activeGroup,priceDelta:Number(draftValue.price),stockQuantity:draftValue.stock===""?null:Number(draftValue.stock),sortOrder:Number(draftValue.sort),imageUrl:draftValue.imageUrl.trim()||null,nameEn:draftValue.nameEn.trim(),nameFr:draftValue.nameFr.trim()}}),tr("تم حفظ الإضافة","Add-on saved","Option enregistrée"))){setEditingValue(null);setDraftValue(emptyValue)}
 }
 function editGroup(group:Resource){setEditingGroup(group.id);setDraftGroup({name:group.name,nameEn:String(group.data.nameEn??""),nameFr:String(group.data.nameFr??""),required:group.data.requiredFlag==="yes",multiple:group.data.selectionType==="multiple",min:String(group.data.minSelect??0),max:String(group.data.maxSelect??1),sort:String(group.data.sortOrder??0)})}
 function editValue(v:Resource,copy=false){setGroupId(String(v.data.groupId??""));setEditingValue(copy?null:v.id);setDraftValue({name:v.name+(copy?" - "+tr("نسخة","Copy","Copie"):""),nameEn:String(v.data.nameEn??""),nameFr:String(v.data.nameFr??""),price:String(v.data.priceDelta??0),stock:v.data.stockQuantity==null?"":String(v.data.stockQuantity),sort:String(v.data.sortOrder??0),imageUrl:String(v.data.imageUrl??"")})}
 function exportAll(){
  downloadCsv([["name","menuItem","menuItemId","groupName","groupNameEn","groupNameFr","price","stockQuantity","isRequired","minSelections","maxSelections","sortOrder","isAvailable","valueEn","valueFr","imageUrl"],...itemGroups.flatMap(g=>{const available=values.filter(v=>v.data.groupId===g.id);return available.length?available.map(v=>[v.name,nameOfItem(itemId),itemId,g.name,g.data.nameEn,g.data.nameFr,v.data.priceDelta??0,v.data.stockQuantity??"",g.data.requiredFlag==="yes",g.data.minSelect??0,g.data.maxSelect??1,v.data.sortOrder??0,v.status==="active",v.data.nameEn,v.data.nameFr,v.data.imageUrl]):[["",nameOfItem(itemId),itemId,g.name,g.data.nameEn,g.data.nameFr,0,"",g.data.requiredFlag==="yes",g.data.minSelect??0,g.data.maxSelect??1,g.data.sortOrder??0,g.status==="active","","",""]]})],"foon-menu-addons-"+itemId+".csv");
 }
 async function importFile(file:File){
  if(file.size>1024*1024){setError("CSV_FILE_TOO_LARGE");return}
  setBusy(true);setError("");setMessage("");
  let done=0;
  try{
   const rows=decodeCsv((await file.text()).replace(/^\uFEFF/,""));if(rows.length>501)throw Error("CSV_ROW_LIMIT");
   const header=rows.shift()?.map(v=>v.toLowerCase())??[];
   const field=(line:string[],key:string,fallback="")=>line[header.indexOf(key.toLowerCase())]??fallback;
   if(!header.includes("name")||!header.includes("groupname"))throw Error("CSV_HEADERS_REQUIRED");
   const existingGroups=new Map(itemGroups.map(g=>[g.name.trim().toLowerCase(),g.id]));
   const existingValues=new Set(values.filter(v=>v.data.groupId).map(v=>String(v.data.groupId)+":"+v.name.trim().toLowerCase()));
   for(const line of rows){
    const productId=field(line,"menuItemId"),productName=field(line,"menuItem");
    if(productId&&productId!==itemId||productName&&productName!==nameOfItem(itemId))continue;
    const groupName=field(line,"groupName").trim(),optionName=field(line,"name").trim();
    if(!groupName)continue;
    const price=Number(field(line,"price","0")),stockText=field(line,"stockQuantity","");
    const stock=stockText===""?null:Number(stockText);
    if(!Number.isFinite(price)||price<0||price>1000000||stock!==null&&(!Number.isFinite(stock)||stock<0))throw Error("CSV_INVALID_VALUE_ROW_"+(done+2));
    let id=existingGroups.get(groupName.toLowerCase());
    if(!id){
     const required=field(line,"isRequired")==="true",min=Number(field(line,"minSelections",required?"1":"0")),max=Number(field(line,"maxSelections","1"));
     if(!Number.isInteger(min)||!Number.isInteger(max)||min<0||min>max)throw Error("CSV_INVALID_GROUP");
     const created=await api("menuGroups","POST",{name:groupName,status:"active",data:{itemId,selectionType:max>1?"multiple":"single",requiredFlag:required?"yes":"no",minSelect:min,maxSelect:max,nameEn:field(line,"groupNameEn"),nameFr:field(line,"groupNameFr")}});
     id=created.id;existingGroups.set(groupName.toLowerCase(),id);
    }
    if(!id||!id36.test(id))throw Error("INVALID_GROUP_ID");
    if(!optionName)continue;
    const valueKey=id+":"+optionName.toLowerCase();
    if(existingValues.has(valueKey))continue; // Resume and repeated imports must not duplicate add-ons.
    await api("menuValues","POST",{name:optionName,status:field(line,"isAvailable","true")==="false"?"inactive":"active",data:{groupId:id,priceDelta:price,stockQuantity:stock,nameEn:field(line,"valueEn"),nameFr:field(line,"valueFr"),sortOrder:Number(field(line,"sortOrder","0")),imageUrl:field(line,"imageUrl")||null}});
    existingValues.add(valueKey);done++;
   }
   await refresh();setMessage(tr("تم استيراد ","Imported ","Importés : ")+done);
  }catch(e){setError(tr("تعذر إكمال استيراد CSV بعد ","CSV import stopped after ","Import CSV interrompu après ")+done+": "+(e instanceof Error?e.message:"UNKNOWN"));await refresh().catch(()=>{})}
  finally{setBusy(false)}
 }
 return <section className="foonMenuStep" id="menu-addons" dir={language==="ar"?"rtl":"ltr"} style={{minWidth:0,overflowWrap:"anywhere"}}>
  <h2>{tr("إضافات المنتجات والأصناف","Product add-ons and options","Suppléments et options")}</h2>
  <p>{tr("مجموعات إلزامية أو اختيارية، سعر إضافي، مخزون مستقل، ترتيب، نسخ، إيقاف واستيراد وتصدير. الأسعار والتحقق من المخزون يعاد احتسابها عند الطلب.","Required/optional groups, price, stock, ordering, copy, availability and CSV transfer. Checkout recalculates prices and stock.","Groupes requis ou facultatifs, prix, stock, ordre, copie, disponibilité et CSV.")}</p>
  {loading?<p>{tr("جارٍ التحميل...","Loading...","Chargement...")}</p>:<div style={fields}>
  <label>{tr("الصنف","Product","Produit")}<select value={itemId} onChange={e=>{setItemId(e.target.value);setEditingGroup(null);setEditingValue(null);setDraftGroup(emptyGroup);setDraftValue(emptyValue)}}>{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
  <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
   <input style={{minWidth:0,flex:"1 1 160px"}} aria-label={tr("بحث عن إضافة","Search add-ons","Recherche d’options")} placeholder={tr("بحث بالمجموعة أو الإضافة","Search group or add-on","Rechercher groupe ou option")} value={query} onChange={e=>setQuery(e.target.value)}/>
   <button type="button" disabled={!values.length} onClick={exportAll}>{tr("تصدير CSV","Export CSV","Exporter CSV")}</button>
   <input ref={inputRef} hidden type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.currentTarget.value=""}}/>
   <button type="button" disabled={busy||!itemId} onClick={()=>inputRef.current?.click()}>{tr("استيراد CSV","Import CSV","Importer CSV")}</button>
   <button type="button" disabled={busy} onClick={()=>void perform(refresh,tr("تم التحديث","Refreshed","Actualisé"))}>{tr("تحديث","Refresh","Actualiser")}</button>
  </div>
  <form onSubmit={e=>{e.preventDefault();void storeGroup()}} style={{...fields,border:"1px solid #8885",borderRadius:12,padding:12}}>
   <h3>{editingGroup?tr("تعديل مجموعة","Edit group","Modifier le groupe"):tr("مجموعة إضافات جديدة","New group","Nouveau groupe")}</h3>
   <label>{tr("اسم المجموعة","Group name","Nom du groupe")}<input required maxLength={180} value={draftGroup.name} onChange={e=>setDraftGroup(p=>({...p,name:e.target.value}))}/></label>
   <label>English<input maxLength={180} value={draftGroup.nameEn} onChange={e=>setDraftGroup(p=>({...p,nameEn:e.target.value}))}/></label>
   <label>Français<input maxLength={180} value={draftGroup.nameFr} onChange={e=>setDraftGroup(p=>({...p,nameFr:e.target.value}))}/></label>
   <div style={{display:"flex",flexWrap:"wrap",gap:12}}><label><input type="checkbox" checked={draftGroup.required} onChange={e=>setDraftGroup(p=>({...p,required:e.target.checked,min:e.target.checked?String(Math.max(1,Number(p.min)||1)):"0"}))}/>{tr("إلزامية","Required","Requis")}</label><label><input type="checkbox" checked={draftGroup.multiple} onChange={e=>setDraftGroup(p=>({...p,multiple:e.target.checked,max:e.target.checked?"2":"1",min:!e.target.checked&&Number(p.min)>1?"1":p.min}))}/>{tr("اختيارات متعددة","Multiple choices","Choix multiples")}</label></div>
   <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
    <label>{tr("الأدنى","Minimum","Minimum")}<input type="number" min={draftGroup.required?1:0} max={draftGroup.multiple?100:1} value={draftGroup.min} onChange={e=>setDraftGroup(p=>({...p,min:e.target.value}))} required dir="ltr"/></label>
    {draftGroup.multiple&&<label>{tr("الأقصى","Maximum","Maximum")}<input type="number" min={1} max={100} value={draftGroup.max} onChange={e=>setDraftGroup(p=>({...p,max:e.target.value}))} required dir="ltr"/></label>}
    <label>{tr("الترتيب","Sort order","Ordre")}<input type="number" min={0} max={1000000} value={draftGroup.sort} onChange={e=>setDraftGroup(p=>({...p,sort:e.target.value}))} required dir="ltr"/></label>
   </div>
   <div><button disabled={busy||!itemId} type="submit">{tr("حفظ المجموعة","Save group","Enregistrer le groupe")}</button> {editingGroup&&<button type="button" onClick={()=>{setEditingGroup(null);setDraftGroup(emptyGroup)}}>{tr("إلغاء التعديل","Cancel edit","Annuler")}</button>}</div>
  </form>
  {!!itemGroups.length&&<form onSubmit={e=>{e.preventDefault();void storeValue()}} style={{...fields,border:"1px solid #8885",borderRadius:12,padding:12}}>
   <h3>{editingValue?tr("تعديل الإضافة","Edit add-on","Modifier l’option"):tr("إضافة جديدة","New add-on","Nouvelle option")}</h3>
   <label>{tr("المجموعة","Group","Groupe")}<select value={activeGroup} onChange={e=>setGroupId(e.target.value)}>{itemGroups.filter(g=>g.status==="active").map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
   <label>{tr("اسم الإضافة","Add-on name","Nom de l’option")}<input required maxLength={180} value={draftValue.name} onChange={e=>setDraftValue(p=>({...p,name:e.target.value}))}/></label>
   <label>English<input maxLength={180} value={draftValue.nameEn} onChange={e=>setDraftValue(p=>({...p,nameEn:e.target.value}))}/></label>
   <label>Français<input maxLength={180} value={draftValue.nameFr} onChange={e=>setDraftValue(p=>({...p,nameFr:e.target.value}))}/></label>
   <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
    <label>{tr("السعر الإضافي","Extra price","Supplément")}<input type="number" min={0} max={1000000} step="0.01" dir="ltr" value={draftValue.price} onChange={e=>setDraftValue(p=>({...p,price:e.target.value}))} required/></label>
    <label>{tr("المخزون (فارغ = غير محدود)","Stock (blank = unlimited)","Stock (vide = illimité)")}<input type="number" min={0} max={999999999} step="0.001" dir="ltr" value={draftValue.stock} onChange={e=>setDraftValue(p=>({...p,stock:e.target.value}))}/></label>
    <label>{tr("الترتيب","Order","Ordre")}<input type="number" min={0} max={1000000} dir="ltr" value={draftValue.sort} onChange={e=>setDraftValue(p=>({...p,sort:e.target.value}))} required/></label>
   </div>
   <label>{tr("رابط صورة الإضافة HTTPS","Add-on image HTTPS URL","Image HTTPS de l’option")}<input type="url" maxLength={1024} value={draftValue.imageUrl} onChange={e=>setDraftValue(p=>({...p,imageUrl:e.target.value}))}/></label>
   <div><button type="submit" disabled={busy||!itemGroups.some(g=>g.id===activeGroup&&g.status==="active")}>{tr("حفظ الإضافة","Save add-on","Enregistrer")}</button> {editingValue&&<button type="button" onClick={()=>{setEditingValue(null);setDraftValue(emptyValue)}}>{tr("إلغاء التعديل","Cancel edit","Annuler")}</button>}</div>
  </form>}
  {visibleGroups.map(g=><section key={g.id} style={{border:"1px solid #8885",padding:12,borderRadius:12,minWidth:0}}>
   <h3>{g.name} — {g.data.requiredFlag==="yes"?tr("إلزامية","Required","Requis"):tr("اختيارية","Optional","Facultatif")} ({g.data.minSelect??0}–{g.data.maxSelect??1})</h3>
   <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
    <button disabled={busy} onClick={()=>editGroup(g)}>{tr("تعديل","Edit","Modifier")}</button>
    <button disabled={busy} onClick={()=>void perform(()=>api("menuGroups","PATCH",{id:g.id,version:g.version,name:g.name,status:g.status==="active"?"inactive":"active",data:g.data}),tr("تم تغيير الحالة","Status updated","Statut modifié"))}>{g.status==="active"?tr("إيقاف","Disable","Désactiver"):tr("تفعيل","Enable","Activer")}</button>
    <button disabled={busy} onClick={()=>{if(window.confirm(tr("حذف المجموعة وإضافاتها؟","Delete group and its values?","Supprimer le groupe et ses choix ?")))void perform(()=>api("menuGroups","DELETE",{id:g.id,version:g.version}),tr("تم حذف المجموعة","Group deleted","Groupe supprimé"))}}>{tr("حذف","Delete","Supprimer")}</button>
   </div>
   {values.filter(v=>v.data.groupId===g.id&&(v.name+" "+String(v.data.nameEn??"")+" "+String(v.data.nameFr??"")+" "+g.name).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>Number(a.data.sortOrder??0)-Number(b.data.sortOrder??0)||a.name.localeCompare(b.name)).map(v=><div key={v.id} style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8,paddingBlock:8,borderBottom:"1px solid #8883"}}>
    <strong>{v.name}</strong><span dir="ltr">+{Number(v.data.priceDelta??0).toFixed(2)} SAR</span><span>{v.data.stockQuantity==null?"∞":v.data.stockQuantity}</span><span>{v.status==="active"?tr("متاح","Available","Disponible"):tr("متوقف","Inactive","Inactif")}</span>
    <button disabled={busy} onClick={()=>editValue(v)}>{tr("تعديل","Edit","Modifier")}</button>
    <button disabled={busy} onClick={()=>editValue(v,true)}>{tr("نسخ","Copy","Copier")}</button>
    <button disabled={busy} onClick={()=>void perform(()=>api("menuValues","PATCH",{id:v.id,version:v.version,name:v.name,status:v.status==="active"?"inactive":"active",data:v.data}),tr("تم تغيير الحالة","Availability updated","Disponibilité modifiée"))}>{v.status==="active"?tr("إيقاف","Disable","Désactiver"):tr("تفعيل","Enable","Activer")}</button>
    <button disabled={busy} onClick={()=>{if(window.confirm(tr("حذف الإضافة؟","Delete this add-on?","Supprimer cette option ?")))void perform(()=>api("menuValues","DELETE",{id:v.id,version:v.version}),tr("تم حذف الإضافة","Add-on deleted","Option supprimée"))}}>{tr("حذف","Delete","Supprimer")}</button>
   </div>)}
  </section>)}
  </div>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </section>;
}
