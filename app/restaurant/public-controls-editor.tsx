"use client";
import {useEffect,useState} from "react";
import {defaultPublicControls,type PublicControls} from "@/lib/tenant/public-controls-core";
import InternationalShippingEditor from "./international-shipping-editor";
const groups:{title:string;entries:{key:keyof PublicControls;ar:string;en:string}[]}[]=[
 {title:"الواجهة وحسابات العملاء",entries:[{key:"customerLogin",ar:"دخول وتسجيل حسابات العملاء",en:"Customer login and sign-up"},{key:"sales",ar:"استقبال الطلبات والبيع",en:"Accepting sales and orders"},{key:"cart",ar:"سلة العميل",en:"Customer cart"}]},
 {title:"الحجز والخدمة",entries:[{key:"reservations",ar:"الحجوزات",en:"Reservations"},{key:"waiter",ar:"نداء النادل",en:"Call waiter"},{key:"serviceRequests",ar:"طلبات الخدمات وعروض الأسعار",en:"Service requests and quotations"}]},
 {title:"قنوات الطلب",entries:[{key:"takeaway",ar:"السفري والاستلام",en:"Takeaway and pickup"},{key:"delivery",ar:"التوصيل",en:"Delivery"},{key:"dineIn",ar:"المحلي والطاولات",en:"Dine-in"},{key:"roomService",ar:"خدمة الغرف والفنادق",en:"Room and hotel service"}]},
 {title:"عرض الأدوات ومعلومات المتجر",entries:[{key:"catalog",ar:"عرض المنتجات والخدمات",en:"Show products and services"},{key:"search",ar:"البحث في المنيو والمتجر",en:"Search"},{key:"categories",ar:"الأقسام والتصنيفات",en:"Categories"},{key:"qr",ar:"رمز QR للواجهة",en:"Storefront QR"},{key:"contact",ar:"بيانات التواصل والموقع",en:"Contact and location"},{key:"policies",ar:"روابط السياسات والشروط",en:"Policies"},{key:"social",ar:"روابط التواصل الاجتماعي",en:"Social links"}]}
];
export default function PublicControlsEditor({tenantId,activity}:{tenantId:string;activity:string}){
 const [controls,setControls]=useState<PublicControls>(defaultPublicControls);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[ready,setReady]=useState(false);
 const [deliveryCity,setDeliveryCity]=useState(""),[savedDeliveryCity,setSavedDeliveryCity]=useState("");
 useEffect(()=>{let active=true;fetch("/api/restaurant/public-controls",{headers:{"x-foon-tenant":tenantId},cache:"no-store"}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{if(active){setControls(data.controls);const city=String(data.deliveryCity??"");setDeliveryCity(city);setSavedDeliveryCity(city);setReady(true)}}).catch(()=>{if(active)setMessage("تعذر تحميل إعدادات الواجهة. أعد المحاولة.")});return()=>{active=false}},[tenantId]);
 async function change(key:keyof PublicControls,enabled:boolean){
  if(busy)return;
  setBusy(true);setMessage("");
  try{const response=await fetch("/api/restaurant/public-controls",{method:"PUT",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({controls:{[key]:enabled}})});
  const result=await response.json();if(!response.ok)throw Error();setControls(result.controls);setMessage("تم الحفظ تلقائيًا.");}
  catch{setMessage("تعذر حفظ التعديل، لم تتغير إعدادات الواجهة.");}
  finally{setBusy(false);}
 }
 async function saveDeliveryCity(){
  const city=deliveryCity.trim();
  if(!ready||busy||city===savedDeliveryCity)return;
  setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/restaurant/public-controls",{method:"PUT",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({deliveryCity:city})});
   if(!response.ok)throw Error();
   setSavedDeliveryCity(city);setDeliveryCity(city);setMessage("تم حفظ مدينة المتجر.");
  }catch{setMessage("تعذر حفظ المدينة. حاول مرة أخرى.");}finally{setBusy(false);}
 }
 return <section className="restaurantPanel" dir="rtl" aria-label="تشغيل خصائص واجهة العملاء" style={{marginBlock:18}}>
  <header><div><h3>التحكم في خصائص واجهة العملاء</h3><p>كل خاصية مستقلة لنشاطك. إيقافها يمنع تنفيذها من واجهة العميل والخادم، ولا يحذف أي طلب سابق.</p></div></header>
  {message&&<p role="status">{message}</p>}
  {groups.map(group=><div key={group.title} style={{marginBlock:16}}>
   <h4>{group.title}</h4><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))",gap:10}}>
    {group.entries.filter(entry=>activity==="restaurant"||activity==="cafe"||!["waiter","dineIn","roomService"].includes(entry.key)).map(entry=><label key={entry.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:12,border:"1px solid #ccd3dc",borderRadius:12,cursor:ready&&!busy?"pointer":"default"}}>
     <span>{entry.ar}</span><input type="checkbox" aria-label={entry.ar} disabled={!ready||busy} checked={controls[entry.key]} onChange={e=>void change(entry.key,e.target.checked)} style={{width:20,height:20,flexShrink:0}}/>
    </label>)}
   </div>
  </div>)}
  <div style={{display:"flex",flexWrap:"wrap",alignItems:"end",gap:12,marginBlock:14}}>
   <label style={{display:"grid",gap:6,flex:"1 1 240px",maxWidth:400}}>مدينة المتجر (اختياري)
    <input aria-label="مدينة المتجر" type="text" maxLength={120} disabled={!ready||busy} value={deliveryCity} onChange={e=>setDeliveryCity(e.target.value)} onBlur={()=>void saveDeliveryCity()} placeholder="مثال: الرياض"/>
   </label>
   <button type="button" disabled={!ready||busy||deliveryCity.trim()===savedDeliveryCity} onClick={()=>void saveDeliveryCity()}>حفظ المدينة</button>
  </div>
  <p style={{fontSize:12,opacity:.75}}>إيقاف البيع أو الكتالوج يمنع طلبات العملاء من الخادم. تفعيل الخاصية هنا لا يتجاوز صلاحيات الباقة أو الوظائف غير المدعومة لنشاطك.</p>
 <InternationalShippingEditor tenantId={tenantId} activity={activity}/>
 </section>
}
