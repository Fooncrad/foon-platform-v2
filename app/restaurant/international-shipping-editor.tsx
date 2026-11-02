"use client";
import {useEffect,useState} from "react";
import {supportedCountries} from "@/lib/tenant/country-catalog";
type Shipping={status:string;requestedCountries:string[];approvedCountries:string[]};
export default function InternationalShippingEditor({tenantId,activity}:{tenantId:string;activity:string}){
 const eligible=!["restaurant","cafe"].includes(activity),[shipping,setShipping]=useState<Shipping|null>(null),[country,setCountry]=useState(""),[countries,setCountries]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[merchantCountry,setMerchantCountry]=useState("");
 useEffect(()=>{if(!eligible)return;let alive=true;fetch("/api/restaurant/international-shipping",{headers:{"x-foon-tenant":tenantId},cache:"no-store"}).then(r=>r.json()).then(d=>{if(alive&&d.ok){setShipping(d.shipping);setCountries(d.shipping.requestedCountries);setMerchantCountry(d.merchantCountry)}}).catch(()=>{if(alive)setMessage("تعذر تحميل إعداد الشحن الدولي")});return()=>{alive=false}},[tenantId,eligible]);
 if(!eligible)return null;
 async function request(){setBusy(true);setMessage("");try{const res=await fetch("/api/restaurant/international-shipping",{method:"POST",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({countries})});const body=await res.json();if(!res.ok)throw Error(body.code);setShipping({...shipping,status:"pending",requestedCountries:countries,approvedCountries:[]} as Shipping);setMessage("تم إرسال طلب الشحن الدولي. يرجى مراسلة أدمن المنصة لاعتماده؛ لن يُتاح البيع قبل الموافقة.")}catch{setMessage("تعذر إرسال الطلب. تحقق من الدول المختارة.")}finally{setBusy(false)}}
 return <section className="restaurantPanel" dir="rtl" aria-label="طلب البيع الدولي" style={{marginBlock:16}}><header><div><h3>البيع والشحن خارج الدولة</h3><p>متاح للمتاجر غير المطاعم والمقاهي فقط. يخضع لموافقة إدارة FOON قبل التفعيل.</p></div></header>
 <p>الحالة: <strong>{shipping?.status==="approved"?"معتمد":shipping?.status==="pending"?"بانتظار موافقة الأدمن":shipping?.status==="rejected"?"مرفوض":"لم يُطلب بعد"}</strong></p>
 {shipping?.status==="approved"&&<p>الدول المعتمدة: {shipping.approvedCountries.join("، ")}</p>}
 <label>إضافة دولة شحن<select value={country} onChange={e=>setCountry(e.target.value)}><option value="">اختر الدولة</option>{supportedCountries.filter(x=>x.code!==merchantCountry).map(x=><option key={x.code} value={x.code}>{x.ar}</option>)}</select></label>
 <button type="button" disabled={!country||countries.includes(country)} onClick={()=>{setCountries(x=>[...x,country]);setCountry("")}}>إضافة دولة</button>
 <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBlock:12}}>{countries.map(code=><button type="button" key={code} onClick={()=>setCountries(x=>x.filter(v=>v!==code))}>{code} ×</button>)}</div>
 <button type="button" disabled={busy||!countries.length} onClick={()=>void request()}>طلب موافقة الأدمن</button>
 <p role="status">{message}</p></section>;
}
