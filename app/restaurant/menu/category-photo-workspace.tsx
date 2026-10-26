"use client";
import {useCallback,useEffect,useState} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import MenuCategoryImageEditor from "./category-image-editor";
type Category={id:string;name:string;nameEn:string;nameFr:string;imageUrl?:string|null;enabled:boolean};
export default function MenuCategoryPhotoWorkspace({tenantId}:{tenantId:string}){
 const lang=useUiLanguage(),t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 const [list,setList]=useState<Category[]>([]),[filter,setFilter]=useState(""),[error,setError]=useState("");
 const load=useCallback(async()=>{const response=await fetch("/api/restaurant/menu/categories",{headers:{"x-foon-tenant":tenantId},cache:"no-store"});const data=await response.json();if(!response.ok)throw Error(data.code??"CATEGORIES_UNAVAILABLE");setList(data.categories??[]);setError("");},[tenantId]);
 useEffect(()=>{let current=true;fetch("/api/restaurant/menu/categories",{headers:{"x-foon-tenant":tenantId},cache:"no-store"}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{if(current)setList(data.categories??[])}).catch(()=>{if(current)setError(t("تعذر تحميل صور الأقسام.","Cannot load category photos.","Impossible de charger les photos."))});return()=>{current=false}},[tenantId]);
 const localized=(c:Category)=>lang==="en"?c.nameEn||c.name:lang==="fr"?c.nameFr||c.name:c.name;
 const filtered=list.filter(c=>[c.name,c.nameEn,c.nameFr].some(x=>x.toLocaleLowerCase().includes(filter.toLocaleLowerCase())));
 return <section className="restaurantPanel" style={{marginTop:18,minWidth:0}} aria-label={t("صور الأقسام المشتركة","Shared category photos","Photos de catégories communes")}>
  <header><div><h3>{t("صور الأقسام","Category cover photos","Photos des catégories")}</h3><p>{t("لكل قسم صورة واحدة تظهر في العربية والإنجليزية والفرنسية، ويمكن رفعها من الجهاز أو المكتبة.","One cover per category shared across Arabic, English and French. Upload from device or library.","Une photo par catégorie, commune à l’arabe, l’anglais et le français.")}</p></div><button type="button" onClick={()=>void load().catch(()=>setError(t("تعذر التحديث.","Could not refresh.","Actualisation impossible.")))}>{t("تحديث","Refresh","Actualiser")}</button></header>
  <label>{t("البحث في الأقسام","Search categories","Rechercher des catégories")} <input type="search" value={filter} onChange={e=>setFilter(e.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,240px),1fr))",gap:12,marginTop:16}}>
   {filtered.map(c=><article key={c.id} style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:12,padding:12,borderRadius:14,border:"1px solid var(--border,#d9e2ee)",minWidth:0}}>
    {c.imageUrl?<img src={c.imageUrl} alt={localized(c)} loading="lazy" width={68} height={68} style={{width:68,height:68,objectFit:"cover",borderRadius:9}}/>:<span style={{fontSize:12}}>{t("بدون صورة","No image","Sans image")}</span>}
    <strong style={{flex:"1 1 110px",overflowWrap:"anywhere"}}>{localized(c)}</strong><MenuCategoryImageEditor tenantId={tenantId} category={c} onSaved={load}/>
   </article>)}
  </div>
 </section>;
}
