"use client";
import {useUiText} from "@/lib/i18n/ui-language";
import {useEffect,useState} from "react";
type Entry={translation_key:string;text_ar:string;text_en:string;text_fr:string};
export default function TranslationEditor({canEdit}:{canEdit:boolean}){
 const translateUi=useUiText();

 const [rows,setRows]=useState<Entry[]>([]),[query,setQuery]=useState(""),[search,setSearch]=useState(""),[page,setPage]=useState(1),[busy,setBusy]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;fetch("/api/admin/translations?q="+encodeURIComponent(search)+"&page="+page).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.code);if(active)setRows(j.rows??[]);}).catch(e=>{if(active)setMessage(String(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[search,page]);
 function edit(key:string,field:keyof Entry,value:string){setRows(old=>old.map(r=>r.translation_key===key?{...r,[field]:value}:r));}
 async function save(row:Entry){setBusy(row.translation_key);setMessage("");try{const r=await fetch("/api/admin/translations",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(row)});const j=await r.json();if(!r.ok)throw Error(j.code);setMessage("تم حفظ "+row.translation_key);}catch(e){setMessage(translateUi("تعذر الحفظ:")+" "+String(e));}finally{setBusy("");}}
 return <section className="adminPanel adminOperationsPanel"><form className="adminOpsSearch" onSubmit={e=>{e.preventDefault();setLoading(true);setPage(1);setSearch(query);}}><label>{translateUi("بحث بالمفتاح أو النص")} <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="بحث في جميع اللغات"/></label><button type="submit">{translateUi("بحث")}</button></form>
 {message&&<p className="adminOpsMessage" role="status">{message}</p>}
 {loading?<p>{translateUi("جارٍ تحميل الترجمات…")}</p>:rows.length===0?<p>{translateUi("لا توجد مفاتيح مسجلة مطابقة. يجب استيراد مفاتيح المشروع الفعلية أولًا.")}</p>:<div className="adminOpsTableWrap"><table className="adminTranslationTable"><thead><tr><th>{translateUi("المفتاح")}</th><th>العربية</th><th>English</th><th>Français</th><th>{translateUi("الحفظ")}</th></tr></thead><tbody>{rows.map(row=><tr key={row.translation_key}><td><code>{row.translation_key}</code></td>{(["text_ar","text_en","text_fr"] as const).map(field=><td key={field}><textarea dir={field==="text_ar"?"rtl":"ltr"} aria-label={field+" "+row.translation_key} value={row[field]} onChange={e=>edit(row.translation_key,field,e.target.value)} readOnly={!canEdit} rows={3}/></td>)}<td>{canEdit&&<button type="button" disabled={busy===row.translation_key} onClick={()=>save(row)}>{busy===row.translation_key?"جارٍ الحفظ":translateUi("حفظ")}</button>}</td></tr>)}</tbody></table></div>}
 <div className="adminOpsPager"><button type="button" disabled={page===1} onClick={()=>{setLoading(true);setPage(p=>p-1);}}>{translateUi("السابق")}</button><span>{translateUi("صفحة")} {page}</span><button type="button" disabled={rows.length<50} onClick={()=>{setLoading(true);setPage(p=>p+1);}}>{translateUi("التالي")}</button></div>
 </section>;
}
