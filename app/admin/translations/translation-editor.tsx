"use client";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import {useEffect,useState,type FormEvent} from "react";

type Entry={translation_key:string;text_ar:string;text_en:string;text_fr:string};
export default function TranslationEditor({canEdit}:{canEdit:boolean}){
 const language=useUiLanguage();
 const t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const [rows,setRows]=useState<Entry[]>([]),[query,setQuery]=useState(""),[search,setSearch]=useState(""),[page,setPage]=useState(1),[busy,setBusy]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let live=true;
  const controller=new AbortController();
  fetch("/api/admin/translations?q="+encodeURIComponent(search)+"&page="+page,{signal:controller.signal,cache:"no-store"})
   .then(async response=>{
    const body=await response.json().catch(()=>null);
    if(!response.ok||!body?.ok){
     if(response.status===401)throw Error("UNAUTHENTICATED");
     if(response.status===403)throw Error("FORBIDDEN");
     throw Error(body?.code||"TRANSLATIONS_UNAVAILABLE");
    }
    if(live)setRows(Array.isArray(body.rows)?body.rows:[]);
   })
   .catch(e=>{if(live&&!controller.signal.aborted){setRows([]);setError(String(e instanceof Error?e.message:e));}})
   .finally(()=>{if(live)setLoading(false)});
  return()=>{live=false;controller.abort()};
 },[search,page,retry]);
 const loadError=error==="UNAUTHENTICATED"?t("انتهت الجلسة. سجّل الدخول مجددًا.","Session expired. Sign in again.","Session expirée. Reconnectez-vous."):error==="FORBIDDEN"?t("لا تملك صلاحية قراءة الترجمات.","You do not have permission to view translations.","Accès aux traductions non autorisé."):t("تعذر تحميل الترجمات من قاعدة البيانات. تحقق من جدول ui_translations وأعد المحاولة.","Could not load translations from the database. Check the ui_translations table and retry.","Impossible de charger les traductions. Vérifiez la table ui_translations et réessayez.");
 function edit(key:string,field:keyof Entry,value:string){setRows(current=>current.map(row=>row.translation_key===key?{...row,[field]:value}:row))}
 async function save(row:Entry){
  setBusy(row.translation_key);setMessage("");setError("");
  try{
   const response=await fetch("/api/admin/translations",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(row)});
   const body=await response.json().catch(()=>null);
   if(!response.ok||!body?.ok)throw Error(body?.code||"TRANSLATION_SAVE_FAILED");
   setMessage(t("تم حفظ الترجمة: ","Translation saved: ","Traduction enregistrée : ")+row.translation_key);
  }catch(e){setMessage(t("تعذر الحفظ: ","Save failed: ","Enregistrement impossible : ")+String(e))}
  finally{setBusy("")}
 }
 function prepareLoad(){setLoading(true);setError("")}
 function applySearch(event:FormEvent<HTMLFormElement>){event.preventDefault();prepareLoad();setPage(1);setSearch(query);setRetry(value=>value+1)}
 return <section className="adminPanel adminOperationsPanel">
  <form className="adminOpsSearch" onSubmit={applySearch}>
   <label>{t("بحث بالمفتاح أو النص","Search by key or text","Rechercher par clé ou texte")} <input value={query} onChange={event=>setQuery(event.target.value)} placeholder={t("بحث في جميع اللغات","Search in all languages","Rechercher dans toutes les langues")}/></label>
   <button type="submit">{t("بحث","Search","Rechercher")}</button>
  </form>
  {message&&<p className="adminOpsMessage" role="status">{message}</p>}
  {loading?<p role="status">{t("جارٍ تحميل الترجمات…","Loading translations…","Chargement des traductions…")}</p>:error?
   <div role="alert" className="adminOpsMessage"><p>{loadError}</p><button type="button" onClick={()=>{prepareLoad();setRetry(value=>value+1)}}>{t("إعادة المحاولة","Retry","Réessayer")}</button></div>:
   rows.length===0?<p>{t("لا توجد مفاتيح مسجلة مطابقة. يجب استيراد مفاتيح المشروع الفعلية أولًا.","No matching translation keys. Import the project's keys first.","Aucune clé correspondante. Importez d’abord les clés du projet.")}</p>:
   <div className="adminOpsTableWrap"><table className="adminTranslationTable"><thead><tr><th>{t("المفتاح","Key","Clé")}</th><th>العربية</th><th>English</th><th>Français</th><th>{t("الحفظ","Save","Enregistrer")}</th></tr></thead><tbody>
    {rows.map(row=><tr key={row.translation_key}><td><code dir="ltr">{row.translation_key}</code></td>{(["text_ar","text_en","text_fr"] as const).map(field=><td key={field}><textarea dir={field==="text_ar"?"rtl":"ltr"} aria-label={field+" "+row.translation_key} value={row[field]} onChange={event=>edit(row.translation_key,field,event.target.value)} readOnly={!canEdit} rows={3}/></td>)}<td>{canEdit&&<button type="button" disabled={busy===row.translation_key} onClick={()=>void save(row)}>{busy===row.translation_key?t("جارٍ الحفظ…","Saving…","Enregistrement…"):t("حفظ","Save","Enregistrer")}</button>}</td></tr>)}
   </tbody></table></div>}
  {!loading&&!error&&<div className="adminOpsPager"><button type="button" disabled={page===1} onClick={()=>{prepareLoad();setPage(value=>Math.max(1,value-1))}}>{t("السابق","Previous","Précédent")}</button><span>{t("صفحة","Page","Page")} {page}</span><button type="button" disabled={rows.length<50} onClick={()=>{prepareLoad();setPage(value=>value+1)}}>{t("التالي","Next","Suivant")}</button></div>}
 </section>;
}
