"use client";
import {useEffect,useState} from "react";
type Category={id:string;name_ar:string;enabled:boolean};
type Product={id:string;name_ar:string;price:number;currency:string;category_id:string;enabled:boolean;stock_quantity:number|null;name_en:string|null;name_fr:string|null};
export default function ActivityCatalogEditor({tenantId,service}:{tenantId:string;service:boolean}){
 const [categories,setCategories]=useState<Category[]>([]),[products,setProducts]=useState<Product[]>([]);
 const [categoryName,setCategoryName]=useState(""),[productName,setProductName]=useState(""),[categoryId,setCategoryId]=useState(""),[price,setPrice]=useState("0");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function load(){const r=await fetch("/api/restaurant/activity-catalog",{headers:{"x-foon-tenant":tenantId},cache:"no-store"});if(!r.ok)throw Error();const d=await r.json();setCategories(d.categories);setProducts(d.products);setCategoryId(v=>d.categories.some((c:Category)=>c.id===v)?v:d.categories[0]?.id??"")}
 useEffect(()=>{let active=true;fetch("/api/restaurant/activity-catalog",{headers:{"x-foon-tenant":tenantId},cache:"no-store"}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(!active)return;setCategories(d.categories);setProducts(d.products);setCategoryId(d.categories[0]?.id??"");setLoading(false)}).catch(()=>{if(active){setMessage("تعذر تحميل الكتالوج. تحقق من ترحيل قاعدة البيانات.");setLoading(false)}});return()=>{active=false}},[tenantId]);
 async function add(kind:"category"|"product"){setBusy(true);setMessage("");try{const r=await fetch("/api/restaurant/activity-catalog",{method:"POST",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify(kind==="category"?{kind,name:categoryName}:{kind,name:productName,categoryId,price:Number(price)})});if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.code??"SAVE_FAILED")}if(kind==="category")setCategoryName("");else setProductName("");await load();setMessage("تمت الإضافة بنجاح.")}catch(e){setMessage("تعذر الحفظ: "+(e instanceof Error?e.message:"خطأ غير معروف"))}finally{setBusy(false)}}
 async function update(kind:"category"|"product",id:string,changes:Record<string,unknown>){setBusy(true);setMessage("");try{const r=await fetch("/api/restaurant/activity-catalog",{method:"PATCH",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({kind,id,...changes})});if(!r.ok)throw Error((await r.json().catch(()=>({}))).code??"UPDATE_FAILED");await load();setMessage("تم تحديث العنصر.")}catch(e){setMessage("تعذر التحديث: "+(e instanceof Error?e.message:"خطأ"))}finally{setBusy(false)}}
 async function addImage(product:string){
  const url=window.prompt("رابط الصورة HTTPS");
  if(!url)return;
  setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/restaurant/activity-catalog/images",{method:"POST",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({product,url})});
   if(!response.ok)throw Error((await response.json()).code);
   setMessage("تمت إضافة الصورة إلى المنتج.");
  }catch(error){setMessage("تعذر إضافة الصورة: "+String(error))}
  finally{setBusy(false)}
 }
 async function removeItem(kind:"category"|"product",id:string){
  if(!window.confirm("هل تريد حذف العنصر نهائيًا؟"))return;
  setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/restaurant/activity-catalog",{method:"DELETE",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({kind,id})});
   if(!response.ok)throw Error((await response.json()).code);
   await load();setMessage("تم الحذف.");
  }catch(error){setMessage("تعذر الحذف: "+String(error))}
  finally{setBusy(false)}
 }
 return <section className="adminPanel"><h2>{service?"إدارة الخدمات":"إدارة المنتجات"}</h2><p>أضف أقسامًا ثم {service?"خدمات":"منتجات"} تظهر في واجهة نشاطك.</p>
  <form onSubmit={e=>{e.preventDefault();void add("category")}} className="foonMenuCategoryForm"><label htmlFor="activity-category-name">اسم القسم</label><input id="activity-category-name" aria-label="اسم القسم" placeholder="اسم القسم" value={categoryName} maxLength={180} minLength={2} required onChange={e=>setCategoryName(e.target.value)} disabled={busy||loading}/><button type="submit" disabled={busy||loading}>إضافة قسم</button></form>
  <form onSubmit={e=>{e.preventDefault();void add("product")}} className="foonItemForm"><label>اسم المنتج أو الخدمة<input aria-label="اسم المنتج أو الخدمة" placeholder={service?"اسم الخدمة":"اسم المنتج"} value={productName} maxLength={180} minLength={2} required onChange={e=>setProductName(e.target.value)} disabled={busy||loading}/></label><label>القسم<select aria-label="القسم" value={categoryId} required onChange={e=>setCategoryId(e.target.value)} disabled={busy||loading||!categories.length}>{categories.map(c=><option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></label><label>السعر (SAR)<input aria-label="السعر" type="number" min="0" step="0.01" value={price} required onChange={e=>setPrice(e.target.value)} disabled={busy||loading}/></label><button type="submit" disabled={busy||loading||!categoryId}>إضافة {service?"خدمة":"منتج"}</button></form>
  <h3>الأقسام</h3><div className="foonMenuCategoryList">{categories.map(c=><div key={c.id} className="foonCatalogRow"><strong>{c.name_ar}</strong><button type="button" disabled={busy} onClick={()=>{const name=window.prompt("تعديل اسم القسم",c.name_ar);if(name!==null)void update("category",c.id,{name})}}>تعديل الاسم</button><button type="button" disabled={busy} onClick={()=>void update("category",c.id,{enabled:!Boolean(c.enabled)})}>{c.enabled?"إخفاء":"إظهار"}</button><button type="button" disabled={busy} onClick={()=>void removeItem("category",c.id)}>حذف</button></div>)}</div>
  <p>الأقسام: {categories.length} · {service?"الخدمات":"المنتجات"}: {products.length}</p>
  <div className="foonMenuCategoryList">{products.map(p=><div key={p.id} className="foonCatalogRow"><span>{p.name_ar}</span><strong>{Number(p.price).toFixed(2)} {p.currency}</strong><button type="button" disabled={busy} onClick={()=>{const name=window.prompt("تعديل الاسم",p.name_ar);if(name!==null)void update("product",p.id,{name})}}>الاسم</button><button type="button" disabled={busy} onClick={()=>{const value=window.prompt("السعر الجديد",String(p.price));if(value!==null&&value.trim()!=="")void update("product",p.id,{price:Number(value)})}}>السعر</button><button type="button" disabled={busy} onClick={()=>{const quantity=window.prompt("كمية المخزون (اتركه فارغًا لغير المحدود)",p.stock_quantity==null?"":String(p.stock_quantity));if(quantity!==null)void update("product",p.id,{stockQuantity:quantity.trim()===""?null:Number(quantity)})}}>المخزون</button><button type="button" disabled={busy} onClick={()=>{const nameEn=window.prompt("English name",p.name_en??"");if(nameEn!==null)void update("product",p.id,{nameEn})}}>EN</button><button type="button" disabled={busy} onClick={()=>{const nameFr=window.prompt("Nom français",p.name_fr??"");if(nameFr!==null)void update("product",p.id,{nameFr})}}>FR</button><button type="button" disabled={busy} onClick={()=>void update("product",p.id,{enabled:!Boolean(p.enabled)})}>{p.enabled?"إخفاء":"إظهار"}</button><select aria-label={"قسم "+p.name_ar} value={p.category_id} disabled={busy} onChange={e=>void update("product",p.id,{categoryId:e.target.value})}>{categories.map(c=><option key={c.id} value={c.id}>{c.name_ar}</option>)}</select><button type="button" disabled={busy} onClick={()=>void addImage(p.id)}>إضافة صورة</button><button type="button" disabled={busy} onClick={()=>void removeItem("product",p.id)}>حذف</button></div>)}</div>
  {message&&<p role="status">{message}</p>}
 </section>;
}
