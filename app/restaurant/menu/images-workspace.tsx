"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import MenuItemImages from "./item-images";
type Item={id:string;name:string;nameEn?:string;nameFr?:string;imageUrl?:string|null;category_id:string;price:number;currency:string};
type Category={id:string;name:string;nameEn?:string;nameFr?:string};
export default function MenuImagesWorkspace({tenantId}:{tenantId:string}){
 const lang=useUiLanguage(),t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 const [items,setItems]=useState<Item[]>([]),[categories,setCategories]=useState<Category[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const [filter,setFilter]=useState(""),[category,setCategory]=useState(""),[limit,setLimit]=useState(24);
 const load=useCallback(async()=>{
  const headers={"x-foon-tenant":tenantId};
  const [a,b]=await Promise.all([fetch("/api/restaurant/menu/items",{headers,cache:"no-store"}),fetch("/api/restaurant/menu/categories",{headers,cache:"no-store"})]);
  if(!a.ok||!b.ok)throw Error("MENU_IMAGES_UNAVAILABLE");
  const itemData=await a.json(),categoryData=await b.json();
  setItems(itemData.items??[]);setCategories(categoryData.categories??[]);setError("");setLoading(false);
 },[tenantId]);
 useEffect(()=>{let active=true;const headers={"x-foon-tenant":tenantId};
  Promise.all([fetch("/api/restaurant/menu/items",{headers,cache:"no-store"}),fetch("/api/restaurant/menu/categories",{headers,cache:"no-store"})])
  .then(async([a,b])=>{if(!a.ok||!b.ok)throw Error();return [(await a.json()).items??[],(await b.json()).categories??[]] as const;})
  .then(([rows,groups])=>{if(active){setItems(rows);setCategories(groups);setError("");setLoading(false);}})
  .catch(()=>{if(active){setError(t("تعذر تحميل الصور. حاول التحديث.","Unable to load images. Retry.","Chargement des images impossible. Réessayez."));setLoading(false);}});
  return()=>{active=false};
 },[tenantId]); 
 const visible=useMemo(()=>items.filter(item=>(!category||item.category_id===category)&&(!filter||[item.name,item.nameEn??"",item.nameFr??""].some(name=>name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())))),[items,category,filter]);
 const localized=(item:Item)=>lang==="en"?item.nameEn||item.name:lang==="fr"?item.nameFr||item.name:item.name;
 return <section className="restaurantPanel" aria-label={t("صور الأصناف","Product images","Images des articles")} style={{minWidth:0}}>
  <header style={{display:"flex",gap:12,justifyContent:"space-between",flexWrap:"wrap"}}><div><h3>{t("صور الأصناف الأربعة","Four images per item","Quatre images par article")}</h3><p>{t("صورة رئيسية وثلاث إضافية مشتركة في جميع اللغات، دون نسخ الصور لكل لغة.","One cover and three more shared across all languages.","Une image principale et trois supplémentaires communes aux langues.")}</p></div><button type="button" onClick={()=>void load().catch(()=>setError(t("تعذر تحديث البيانات.","Could not refresh.","Actualisation impossible.")))}>{t("تحديث","Refresh","Actualiser")}</button></header>
  <div style={{display:"flex",flexWrap:"wrap",gap:12,marginBlock:16}}>
   <label style={{display:"grid",gap:5,flex:"2 1 180px"}}>{t("ابحث عن الصنف","Find an item","Rechercher un article")}<input type="search" value={filter} onChange={e=>{setFilter(e.target.value);setLimit(24);}} placeholder={t("اسم الصنف","Item name","Nom de l’article")}/></label>
   <label style={{display:"grid",gap:5,flex:"1 1 180px"}}>{t("القسم","Category","Catégorie")}<select value={category} onChange={e=>{setCategory(e.target.value);setLimit(24);}}><option value="">{t("جميع الأقسام","All categories","Toutes les catégories")}</option>{categories.map(c=><option key={c.id} value={c.id}>{lang==="en"?c.nameEn||c.name:lang==="fr"?c.nameFr||c.name:c.name}</option>)}</select></label>
  </div>
  <p aria-live="polite">{t("النتائج","Results","Résultats")}: {visible.length.toLocaleString("en-US")}</p>
  {loading?<p>{t("جارٍ التحميل…","Loading…","Chargement…")}</p>:error?<p role="alert">{error}</p>:visible.length===0?<p>{t("لا توجد أصناف مطابقة.","No matching items.","Aucun article correspondant.")}</p>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,290px),1fr))",gap:12}}>
   {visible.slice(0,limit).map(item=><article key={item.id} style={{minWidth:0,padding:12,border:"1px solid var(--border,#d9e2ee)",borderRadius:14,background:"var(--surface,#fff)"}}>
    <div style={{display:"flex",gap:10,alignItems:"center"}}>{item.imageUrl?<img src={item.imageUrl} alt={localized(item)} loading="lazy" width={68} height={68} style={{width:68,height:68,objectFit:"cover",borderRadius:10}}/>:<div style={{width:68,height:68,display:"grid",placeItems:"center",fontSize:11,background:"var(--surface,#f8f8f8)",borderRadius:10}}>{t("بدون صورة","No image","Sans image")}</div>}<div style={{minWidth:0,overflowWrap:"anywhere"}}><strong>{localized(item)}</strong><p dir="ltr">{Number(item.price).toFixed(2)} {item.currency}</p></div></div>
    <MenuItemImages tenantId={tenantId} item={item.id} name={localized(item)} onChanged={load}/>
   </article>)}
  </div>}
  {visible.length>limit&&<button type="button" style={{marginTop:16}} onClick={()=>setLimit(n=>n+24)}>{t("عرض المزيد","Show more","Afficher plus")}</button>}
 </section>;
}
