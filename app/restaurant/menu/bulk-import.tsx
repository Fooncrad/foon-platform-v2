"use client";
import {useState} from "react";
export default function BulkImport({tenantId,kind}:{tenantId:string;kind:"categories"|"items"}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const categories=kind==="categories";
 const example=categories?"name,name_en,name_fr,description\nالمشروبات,Drinks,Boissons,مشروبات متنوعة":"category,name,name_en,name_fr,price,description,description_en,description_fr,image_1,image_2,image_3,image_4\nالمشروبات,قهوة,Coffee,Café,12.00,قهوة ساخنة,Hot coffee,Café chaud,,,,";
 async function upload(file:File){
 setBusy(true);setMessage("");
 try{if(file.size>250000)throw Error("حجم الملف كبير (الحد 250 KB)");
 const csv=await file.text();const response=await fetch("/api/restaurant/menu/bulk",{method:"POST",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({kind,csv})});const data=await response.json();
 if(!response.ok)throw Error(data.code+(data.row?" — الصف "+data.row:"")+(data.category?" — "+data.category:""));
 setMessage("تم استيراد "+data.created+" سجل بنجاح. حدّث الصفحة لعرضها.");
 }catch(e){setMessage("فشل الاستيراد: "+(e instanceof Error?e.message:"خطأ غير معروف"))}finally{setBusy(false)}
 }
 return <div className="foonBulkImport" style={{marginBlock:"1rem",padding:"1rem",border:"1px solid #9995",borderRadius:12}}>
 <h3>{categories?"استيراد الأقسام دفعة واحدة":"استيراد الأصناف دفعة واحدة"}</h3>
 <p>ملف CSV بترميز UTF-8، حتى 500 صف. {categories?"المطلوب name، وتدعم الأعمدة name_en وname_fr وdescription":"المطلوب category وname وprice. تدعم الترجمة name_en وname_fr وdescription_en وdescription_fr، وأربع صور بروابط image_1 إلى image_4. يجب مطابقة اسم القسم الموجود."}</p>
 <a download={categories?"menu-categories.csv":"menu-items.csv"} href={"data:text/csv;charset=utf-8,%EF%BB%BF"+encodeURIComponent(example)}>تحميل نموذج CSV</a>
 <label style={{display:"block",marginTop:12}}>اختر ملف CSV
 <input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value=""}}/>
 </label>{busy?<p role="status">جارٍ الاستيراد…</p>:message?<p role="status">{message}</p>:null}
 </div>
}
