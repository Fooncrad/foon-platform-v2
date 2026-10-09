"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
type Category={id:string;name:string;enabled:boolean};
export default function MenuCategoryEditor({tenantId}:{tenantId:string}){
 const [categories,setCategories]=useState<Category[]>([]);
 const [name,setName]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [loading,setLoading]=useState(true);
 const load=useCallback(async()=>{const r=await fetch("/api/restaurant/menu/categories",{headers:{"x-foon-tenant":tenantId},cache:"no-store"});const data=await r.json();if(!r.ok)throw Error(data.code||"MENU_UNAVAILABLE");return data.categories||[];},[tenantId]);
 async function refresh(){try{setCategories(await load());setError("")}catch{setError("تعذر تحميل الأقسام.")}finally{setLoading(false)}}
 useEffect(()=>{let active=true;load().then(data=>{if(active){setCategories(data);setError("");setLoading(false)}}).catch(()=>{if(active){setError("تعذر تحميل الأقسام.");setLoading(false)}});return()=>{active=false}},[load]);
 async function add(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||!name.trim())return;setBusy(true);setError("");
  try{const r=await fetch("/api/restaurant/menu/categories",{method:"POST",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({name:name.trim()})});const data=await r.json();if(!r.ok)throw Error(data.code||"MENU_SAVE_FAILED");setName("");await refresh()}catch{setError("تعذر حفظ القسم. راجع الاسم أو الصلاحيات وحاول مجددًا.")}finally{setBusy(false)}
 }
 return <section className="adminPanel"><h2>الأقسام</h2><form onSubmit={add} className="foonMenuCategoryForm"><label htmlFor="menu-category-name">اسم القسم</label><input id="menu-category-name" value={name} onChange={e=>setName(e.target.value)} maxLength={180} required placeholder="مثال: المشروبات الساخنة"/><button disabled={busy}>{busy?"جارٍ الحفظ…":"إضافة القسم"}</button></form>{error&&<p role="alert">{error}</p>}{loading?<p>جارٍ تحميل الأقسام…</p>:categories.length===0?<p>لم تضف أقسامًا بعد.</p>:<div className="foonMenuCategoryList">{categories.map(c=><article key={c.id}><strong>{c.name}</strong><span>{c.enabled?"مفعّل":"معطّل"}</span></article>)}</div>}</section>;
}
