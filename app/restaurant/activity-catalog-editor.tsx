"use client";
import {useUiText,useUiLanguage} from "@/lib/i18n/ui-language";
import {useEffect,useState} from "react";
import CatalogDetails from "./catalog-details";
import CatalogOptions from "./catalog-options";
import CatalogImages from "./catalog-images";
import {catalogText,type CatalogLanguage} from "@/lib/platform/catalog-copy";
type Category={id:string;name_ar:string;enabled:boolean};
type Product={id:string;name_ar:string;price:number;currency:string;category_id:string;enabled:boolean;stock_quantity:number|null;name_en:string|null;name_fr:string|null};
export default function ActivityCatalogEditor({tenantId,service,activityCode}:{tenantId:string;service:boolean;activityCode?:string}){
 const translateUi=useUiText();

 const language=useUiLanguage();
 const t=(source:string)=>catalogText(source,language);

 const [currency,setCurrency]=useState("SAR");
 const [categories,setCategories]=useState<Category[]>([]),[products,setProducts]=useState<Product[]>([]);
 const [categoryName,setCategoryName]=useState(""),[productName,setProductName]=useState(""),[categoryId,setCategoryId]=useState(""),[price,setPrice]=useState("0");
 const [description,setDescription]=useState("");
 const [page,setPage]=useState(1),[total,setTotal]=useState(0),[query,setQuery]=useState(""),[filterCategory,setFilterCategory]=useState("");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function load(nextPage=page,nextQuery=query,nextCategory=filterCategory){
  const params=new URLSearchParams({page:String(nextPage)});
  if(nextQuery)params.set("q",nextQuery);
  if(nextCategory)params.set("category",nextCategory);
  const r=await fetch("/api/restaurant/activity-catalog?"+params,{headers:{"x-foon-tenant":tenantId},cache:"no-store"});
  if(!r.ok)throw Error();
  const d=await r.json();
  if(!Array.isArray(d.categories)||!Array.isArray(d.products)||!Number.isFinite(Number(d.total))||!Number.isInteger(d.page)||d.page<1)throw Error("INVALID_CATALOG_RESPONSE");
  setCurrency(typeof d.currency==="string"?d.currency:"SAR");setCategories(d.categories);setProducts(d.products);setTotal(d.total);setPage(d.page);setMessage("");
  setCategoryId(v=>d.categories.some((c:Category)=>c.id===v)?v:d.categories[0]?.id??"");
 }
 useEffect(()=>{let active=true;const params=new URLSearchParams({page:"1"});fetch("/api/restaurant/activity-catalog?"+params,{headers:{"x-foon-tenant":tenantId},cache:"no-store"}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(!active)return;if(!Array.isArray(d.categories)||!Array.isArray(d.products)||!Number.isFinite(Number(d.total)))throw Error("INVALID_CATALOG_RESPONSE");setCurrency(typeof d.currency==="string"?d.currency:"SAR");setCategories(d.categories);setProducts(d.products);setTotal(d.total);setCategoryId(d.categories[0]?.id??"");setLoading(false)}).catch(()=>{if(active){setMessage(translateUi("تعذر تحميل الكتالوج. حاول مجددًا."));setLoading(false)}});return()=>{active=false}},[tenantId]);
 async function add(kind:"category"|"product"){if(kind==="product"&&(!Number.isFinite(Number(price))||price.trim()===""||(Number(price)<0||Number(price)>9999999999))){setMessage(translateUi("أدخل سعرًا صالحًا لا يقل عن الصفر."));return}setBusy(true);setMessage("");try{const r=await fetch("/api/restaurant/activity-catalog",{method:"POST",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify(kind==="category"?{kind,name:categoryName}:{kind,name:productName,categoryId,price:Number(price),description})});if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.code??"SAVE_FAILED")}if(kind==="category")setCategoryName("");else {setProductName("");setDescription("")}await load();setMessage(translateUi("تمت الإضافة بنجاح."))}catch(e){setMessage(translateUi("تعذر الحفظ:")+" "+(e instanceof Error?e.message:translateUi("خطأ غير معروف")))}finally{setBusy(false)}}
 async function update(kind:"category"|"product",id:string,changes:Record<string,unknown>){setBusy(true);setMessage("");try{const r=await fetch("/api/restaurant/activity-catalog",{method:"PATCH",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({kind,id,...changes})});if(!r.ok)throw Error((await r.json().catch(()=>({}))).code??"UPDATE_FAILED");await load();setMessage(translateUi("تم تحديث العنصر."))}catch(e){setMessage(translateUi("تعذر التحديث:")+" "+(e instanceof Error?e.message:translateUi("خطأ")))}finally{setBusy(false)}}
 async function addImage(product:string){
  const url=window.prompt(t("رابط الصورة HTTPS"));
  if(!url)return;
  let parsed:URL;
  try{parsed=new URL(url);if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.toString().length>1024)throw Error()}catch{setMessage(translateUi("أدخل رابط صورة HTTPS صالحًا بدون بيانات دخول."));return}
  setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/restaurant/activity-catalog/images",{method:"POST",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({product,url:parsed.toString()})});
   if(!response.ok)throw Error((await response.json().catch(()=>({}))).code??"IMAGE_SAVE_FAILED");
   setMessage(translateUi("تمت إضافة الصورة إلى المنتج."));
  }catch(error){setMessage(translateUi("تعذر إضافة الصورة:")+" "+String(error))}
  finally{setBusy(false)}
 }
 async function removeItem(kind:"category"|"product",id:string){
  if(!window.confirm(t("هل تريد حذف العنصر نهائيًا؟")))return;
  setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/restaurant/activity-catalog",{method:"DELETE",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({kind,id})});
   if(!response.ok)throw Error((await response.json().catch(()=>({}))).code??"DELETE_FAILED");
   await load();setMessage(translateUi("تم الحذف."));
  }catch(error){setMessage(translateUi("تعذر الحذف:")+" "+String(error))}
  finally{setBusy(false)}
 }
 return <section className="adminPanel" dir={language==="ar"?"rtl":"ltr"} lang={language}><h2>{service?t("إدارة الخدمات"):activityCode==="cafe"?t("قائمة المشروبات والمأكولات"):t("إدارة المنتجات")}</h2><p>{t("أضف أقسامًا ثم") } {service?t("خدمات"):t("منتجات")} {t("تظهر في واجهة نشاطك.") }</p>
  <form onSubmit={e=>{e.preventDefault();void add("category")}} className="foonMenuCategoryForm"><label htmlFor="activity-category-name">{t("اسم القسم") }</label><input id="activity-category-name" aria-label={t("اسم القسم")} placeholder={t("اسم القسم")} value={categoryName} maxLength={180} minLength={2} required onChange={e=>setCategoryName(e.target.value)} disabled={busy||loading}/><button type="submit" disabled={busy||loading}>{t("إضافة قسم") }</button></form>
  <form onSubmit={e=>{e.preventDefault();void add("product")}} className="foonItemForm"><label>{service?t("اسم الخدمة"):activityCode==="cafe"?t("اسم المشروب أو الصنف"):t("اسم المنتج")}<input aria-label={service?t("اسم الخدمة"):activityCode==="cafe"?t("اسم المشروب أو الصنف"):t("اسم المنتج")} placeholder={service?t("اسم الخدمة"):t("اسم المنتج")} value={productName} maxLength={180} minLength={2} required onChange={e=>setProductName(e.target.value)} disabled={busy||loading}/></label><label>{t("القسم") }<select aria-label={t("القسم")} value={categoryId} required onChange={e=>setCategoryId(e.target.value)} disabled={busy||loading||!categories.length}>{categories.map(c=><option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></label><label>{t("السعر (") }{currency})<input aria-label={t("السعر")} type="number" dir="ltr" lang="en" inputMode="decimal" min="0" step="0.01" value={price} required onChange={e=>setPrice(e.target.value)} disabled={busy||loading}/></label><label>{t("الوصف") }<textarea maxLength={5000} rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></label><button type="submit" disabled={busy||loading||!categoryId}>{t("إضافة") } {service?t("خدمة"):t("منتج")}</button></form>
  <h3>{t("الأقسام") }</h3><div className="foonMenuCategoryList">{categories.map(c=><div key={c.id} className="foonCatalogRow" style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8,minWidth:0,maxWidth:"100%"}}><strong>{c.name_ar}</strong><button type="button" disabled={busy} onClick={()=>{const name=window.prompt(t("تعديل اسم القسم"),c.name_ar);if(name!==null)void update("category",c.id,{name})}}>{t("تعديل الاسم") }</button><button type="button" disabled={busy} onClick={()=>void update("category",c.id,{enabled:!Boolean(c.enabled)})}>{c.enabled?t("إخفاء"):t("إظهار")}</button><button type="button" disabled={busy} onClick={()=>void removeItem("category",c.id)}>{t("حذف") }</button></div>)}</div>
  <p>{t("الأقسام:") } {categories.length} · {service?t("الخدمات"):t("المنتجات")}: {total}</p>
  <form onSubmit={e=>{e.preventDefault();void load(1).catch(()=>setMessage(translateUi("تعذر تحديث نتائج البحث. حاول مجددًا.")))}} className="foonItemForm"><label>{t("بحث في الكتالوج") }<input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("ابحث بالاسم بالعربية أو الإنجليزية أو الفرنسية")}/></label><label>{t("تصفية القسم") }<select value={filterCategory} onChange={e=>{setFilterCategory(e.target.value);void load(1,query,e.target.value).catch(()=>setMessage(translateUi("تعذر تطبيق تصفية القسم. حاول مجددًا.")))}}><option value="">{t("جميع الأقسام") }</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></label><button type="submit" disabled={busy}>{t("بحث") }</button></form>
  <div className="foonMenuCategoryList">{products.map(p=><div key={p.id} className="foonCatalogRow" style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8,minWidth:0,maxWidth:"100%"}}><span>{p.name_ar}</span><CatalogDetails tenantId={tenantId} product={p} onSaved={()=>load()}/><CatalogOptions tenantId={tenantId} product={p.id} name={p.name_ar} activity={activityCode}/><strong>{Number(p.price).toFixed(2)} {p.currency}</strong><button type="button" disabled={busy} onClick={()=>{const name=window.prompt(t("تعديل الاسم"),p.name_ar);if(name!==null)void update("product",p.id,{name})}}>{t("الاسم") }</button><button type="button" disabled={busy} onClick={()=>{const value=window.prompt(t("السعر الجديد"),String(p.price));if(value!==null&&value.trim()!==""&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=9999999999)void update("product",p.id,{price:Number(value)});else if(value!==null) setMessage(translateUi("أدخل سعرًا صالحًا لا يقل عن الصفر."))}}>{t("السعر") }</button>{!service&&<button type="button" disabled={busy} onClick={()=>{const quantity=window.prompt(t("كمية المخزون (اتركه فارغًا لغير المحدود)"),p.stock_quantity==null?"":String(p.stock_quantity));if(quantity!==null){const trimmed=quantity.trim();const stock=Number(trimmed);if(trimmed===""||(Number.isInteger(stock)&&stock>=0&&stock<=999999999))void update("product",p.id,{stockQuantity:trimmed===""?null:stock});else setMessage(translateUi("أدخل كمية مخزون صحيحة لا تقل عن الصفر."))}}}>{t("المخزون") }</button>}<button type="button" disabled={busy} onClick={()=>{const nameEn=window.prompt("English name",p.name_en??"");if(nameEn!==null)void update("product",p.id,{nameEn})}}>EN</button><button type="button" disabled={busy} onClick={()=>{const nameFr=window.prompt("Nom français",p.name_fr??"");if(nameFr!==null)void update("product",p.id,{nameFr})}}>FR</button><button type="button" disabled={busy} onClick={()=>void update("product",p.id,{enabled:!Boolean(p.enabled)})}>{p.enabled?t("إخفاء"):t("إظهار")}</button><select aria-label={t("قسم ")+p.name_ar} value={p.category_id} disabled={busy} onChange={e=>void update("product",p.id,{categoryId:e.target.value})}>{categories.map(c=><option key={c.id} value={c.id}>{c.name_ar}</option>)}</select><button type="button" disabled={busy} onClick={()=>void addImage(p.id)}>{t("إضافة رابط صورة") }</button><CatalogImages key={tenantId+":"+p.id} tenantId={tenantId} product={p.id}/><button type="button" disabled={busy} onClick={()=>void removeItem("product",p.id)}>{t("حذف") }</button></div>)}</div>
  <nav className="foonCatalogPagination" aria-label={t("صفحات الكتالوج")} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,padding:16}}><button type="button" disabled={busy||page<=1} onClick={()=>void load(page-1).catch(()=>setMessage(translateUi("تعذر تحميل الصفحة السابقة.")))}>{t("السابق") }</button><span>{t("صفحة") } {page} {t("من") } {Math.max(1,Math.ceil(total/50))}</span><button type="button" disabled={busy||page*50>=total} onClick={()=>void load(page+1).catch(()=>setMessage(translateUi("تعذر تحميل الصفحة التالية.")))}>{t("التالي") }</button></nav>
  {message&&<p role="status">{t(message)}</p>}
 </section>;
}


