"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
type Category={id:string;name:string;enabled:boolean};
type Item={id:string;name:string;price:string;currency:string;category_id:string};
export default function ItemEditor({tenantId}:{tenantId:string}){
 const [categories,setCategories]=useState<Category[]>([]);const [items,setItems]=useState<Item[]>([]);
 const [categoryId,setCategoryId]=useState("");const [name,setName]=useState("");const [description,setDescription]=useState("");const [price,setPrice]=useState("");
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");
 const load=useCallback(async()=>{const headers={"x-foon-tenant":tenantId};const [a,b]=await Promise.all([fetch("/api/restaurant/menu/categories",{headers,cache:"no-store"}),fetch("/api/restaurant/menu/items",{headers,cache:"no-store"})]);if(!a.ok||!b.ok)throw Error("LOAD_FAILED");return {categories:(await a.json()).categories||[],items:(await b.json()).items||[]};},[tenantId]);
 async function refresh(){try{const data=await load();setCategories(data.categories);setItems(data.items)}catch{setError("تعذر تحميل بيانات المنيو.")}}
 useEffect(()=>{let active=true;load().then(data=>{if(active){setCategories(data.categories);setItems(data.items)}}).catch(()=>{if(active)setError("تعذر تحميل بيانات المنيو.")});return()=>{active=false}},[load]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;setBusy(true);setError("");setNotice("");
  try{
   const r=await fetch("/api/restaurant/menu/items",{method:"POST",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({categoryId,name,description,price})});
   const data=await r.json();if(!r.ok)throw Error(data.code||"MENU_SAVE_FAILED");
   setName("");setDescription("");setPrice("");setNotice("تمت إضافة الصنف إلى المنيو.");await refresh();
  }catch{setError("تعذر حفظ الصنف. تأكد من القسم والسعر ثم حاول مجددًا.")}finally{setBusy(false)}
 }
 return <section className="adminPanel"><h2>الأصناف والأسعار</h2><p>أضف الصنف إلى قسم موجود. الأصناف الجديدة تظهر في منيو المطعم بعد الحفظ.</p><form className="foonItemForm" onSubmit={submit}><label>القسم<select required value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">اختر القسم</option>{categories.filter(c=>c.enabled).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>اسم الصنف<input required maxLength={180} value={name} onChange={e=>setName(e.target.value)} placeholder="مثال: كابتشينو"/></label><label>السعر (SAR)<input required type="number" min="0" max="9999999999.99" step="0.01" inputMode="decimal" dir="ltr" value={price} onChange={e=>setPrice(e.target.value)}/></label><label>الوصف<textarea maxLength={5000} value={description} onChange={e=>setDescription(e.target.value)} rows={3}/></label><button disabled={busy||!categoryId}>{busy?"جارٍ الحفظ…":"إضافة الصنف"}</button></form>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}<h3>الأصناف المسجلة ({items.length})</h3><div className="foonMenuCategoryList">{items.map(item=><article key={item.id}><strong>{item.name}</strong><span dir="ltr">{Number(item.price).toFixed(2)} {item.currency}</span></article>)}</div></section>;
}
