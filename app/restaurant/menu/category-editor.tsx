"use client";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import MenuCategoryImageEditor from "./category-image-editor";

type Category={id:string;name:string;nameEn:string;nameFr:string;enabled:boolean;imageUrl?:string|null};
type Names={name:string;nameEn:string;nameFr:string};
export default function MenuCategoryEditor({tenantId}:{tenantId:string}){
 const language=useUiLanguage();
 const tr=useCallback((ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar,[language]);
 const [categories,setCategories]=useState<Category[]>([]);
 const [names,setNames]=useState<Names>({name:"",nameEn:"",nameFr:""});
 const [busy,setBusy]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  const response=await fetch("/api/restaurant/menu/categories",{headers:{"x-foon-tenant":tenantId},cache:"no-store"});
  const body=await response.json();
  if(!response.ok)throw Error(body.code||"MENU_UNAVAILABLE");
  return (body.categories??[]) as Category[];
 },[tenantId]);
 const refresh=useCallback(async()=>{
  try{setCategories(await load());setError("")}catch{setError(tr("تعذر تحميل الأقسام.","Unable to load categories.","Impossible de charger les catégories."))}
  finally{setLoading(false)}
 // The message translations update when language changes without needing a new request.
 },[load,tr]);
 useEffect(()=>{let live=true;load().then(rows=>{if(live){setCategories(rows);setError("")}}).catch(()=>{if(live)setError(tr("تعذر تحميل الأقسام.","Unable to load categories.","Impossible de charger les catégories."))}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[load,tr]);
 useEffect(()=>{
  const onImport=(event:Event)=>{if((event as CustomEvent<{tenantId:string}>).detail?.tenantId===tenantId)void refresh();};
  window.addEventListener('foon:catalog-imported',onImport);
  return()=>window.removeEventListener('foon:catalog-imported',onImport);
 },[tenantId,refresh]);
 async function save(event:FormEvent<HTMLFormElement>,id?:string){
  event.preventDefault();if(busy)return;
  const values=id?Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>:names;
  const input:Names={name:String(values.name??"").trim(),nameEn:String(values.nameEn??"").trim(),nameFr:String(values.nameFr??"").trim()};
  if(!input.name)return;
  setBusy(id??"new");setError("");setMessage("");
  try{
   const response=await fetch("/api/restaurant/menu/categories",{method:id?"PATCH":"POST",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({...input,...(id?{id}:{})})});
   const body=await response.json();
   if(!response.ok)throw Error(body.code||"MENU_SAVE_FAILED");
   if(!id)setNames({name:"",nameEn:"",nameFr:""});
   await refresh();
   setMessage(tr("تم حفظ أسماء القسم باللغات الثلاث.","Category names saved.","Noms des catégories enregistrés."));
  }catch(e){setError(tr("تعذر حفظ القسم. تحقق من صلاحياتك أو قفل الفرع.","Could not save category. Check your access and branch lock.","Enregistrement impossible. Vérifiez vos droits et le verrouillage de succursale.")+" ("+String(e)+")")}
  finally{setBusy("")}
 }
 const fields=[["name",tr("اسم القسم بالعربية","Arabic category name","Nom arabe"),"rtl"],["nameEn","English","ltr"],["nameFr","Français","ltr"]] as const;
 return <section className="adminPanel">
  <h2>{tr("أقسام المنيو وترجماتها","Menu categories and translations","Catégories du menu et traductions")}</h2>
  <p>{tr("أدخل أسماء الأقسام بالعربية والإنجليزية والفرنسية، ثم احفظها لتظهر في المنيو حسب لغة العميل.","Enter category names in Arabic, English and French. Saved names appear in the customer's selected language.","Saisissez les noms en arabe, anglais et français. Le menu affiche la langue choisie par le client.")}</p>
  <form onSubmit={event=>void save(event)} className="foonMenuCategoryForm" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,alignItems:"end"}}>
   {fields.map(([field,label,dir])=><label key={field} style={{display:"grid",gap:6}}>{label}<input dir={dir} value={names[field]} onChange={event=>setNames(old=>({...old,[field]:event.target.value}))} maxLength={180} required={field==="name"} placeholder={field==="name"?tr("مثال: المشروبات الساخنة","Example: hot drinks","Exemple : boissons chaudes"):""}/></label>)}
   <button type="submit" disabled={!!busy}>{busy==="new"?tr("جارٍ الحفظ…","Saving…","Enregistrement…"):tr("إضافة القسم","Add category","Ajouter")}</button>
  </form>
  {error&&<p role="alert">{error}</p>}
  {message&&<p role="status">{message}</p>}
  {loading?<p>{tr("جارٍ تحميل الأقسام…","Loading categories…","Chargement des catégories…")}</p>:categories.length===0?<p>{tr("لم تضف أقسامًا بعد.","No categories yet.","Aucune catégorie.")}</p>:
   <div className="foonMenuCategoryList" style={{display:"grid",gap:12,marginTop:14}}>
    {categories.map(category=><form key={category.id} onSubmit={event=>void save(event,category.id)} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,padding:12,border:"1px solid var(--foon-border, #ddd)",borderRadius:10,alignItems:"end"}}>
     {fields.map(([field,label,dir])=><label key={field} style={{display:"grid",gap:6}}>{label}<input name={field} dir={dir} defaultValue={category[field]??""} maxLength={180} required={field==="name"}/></label>)}
     <div style={{display:"grid",gap:8}}>{category.imageUrl?<img src={category.imageUrl} alt={tr("صورة القسم","Category image","Image de catégorie")+": "+category.name} width={84} height={84} loading="lazy" style={{width:84,height:84,objectFit:"cover",borderRadius:10}}/>:<small>{tr("لا توجد صورة للقسم","No category image","Pas d’image")}</small>}<MenuCategoryImageEditor tenantId={tenantId} category={category} onSaved={refresh}/><small>{category.enabled?tr("مفعّل","Active","Active"):tr("معطّل","Disabled","Désactivée")}</small><button type="submit" disabled={!!busy}>{busy===category.id?tr("جارٍ الحفظ…","Saving…","Enregistrement…"):tr("حفظ الترجمة","Save translations","Enregistrer les traductions")}</button></div>
    </form>)}
   </div>}
 </section>;
}
