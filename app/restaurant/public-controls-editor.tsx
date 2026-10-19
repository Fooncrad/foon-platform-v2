"use client";
import {useEffect,useState} from "react";
import {defaultPublicControls,type PublicControls} from "@/lib/tenant/public-controls";
const groups:{title:string;entries:{key:keyof PublicControls;ar:string;en:string}[]}[]=[
 {title:"الواجهة وحسابات العملاء",entries:[{key:"customerLogin",ar:"دخول وتسجيل حسابات العملاء",en:"Customer login and sign-up"},{key:"sales",ar:"استقبال الطلبات والبيع",en:"Accepting sales and orders"},{key:"cart",ar:"سلة العميل",en:"Customer cart"}]},
 {title:"الحجز والخدمة",entries:[{key:"reservations",ar:"الحجوزات",en:"Reservations"},{key:"waiter",ar:"نداء النادل",en:"Call waiter"},{key:"serviceRequests",ar:"طلبات الخدمات وعروض الأسعار",en:"Service requests and quotations"}]},
 {title:"قنوات الطلب",entries:[{key:"takeaway",ar:"السفري والاستلام",en:"Takeaway and pickup"},{key:"delivery",ar:"التوصيل",en:"Delivery"},{key:"dineIn",ar:"المحلي والطاولات",en:"Dine-in"},{key:"roomService",ar:"خدمة الغرف والفنادق",en:"Room and hotel service"}]}
];
export default function PublicControlsEditor({tenantId,activity}:{tenantId:string;activity:string}){
 const [controls,setControls]=useState<PublicControls>(defaultPublicControls);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[ready,setReady]=useState(false);
 useEffect(()=>{let active=true;setReady(false);fetch("/api/restaurant/public-controls",{headers:{"x-foon-tenant":tenantId},cache:"no-store"}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{if(active){setControls(data.controls);setReady(true)}}).catch(()=>{if(active)setMessage("تعذر تحميل إعدادات الواجهة. أعد المحاولة.")});return()=>{active=false}},[tenantId]);
 async function change(key:keyof PublicControls,enabled:boolean){
  if(busy)return;
  setBusy(true);setMessage("");
  try{const response=await fetch("/api/restaurant/public-controls",{method:"PUT",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({controls:{[key]:enabled}})});
  const result=await response.json();if(!response.ok)throw Error();setControls(result.controls);setMessage("تم الحفظ تلقائيًا.");}
  catch{setMessage("تعذر حفظ التعديل، لم تتغير إعدادات الواجهة.");}
  finally{setBusy(false);}
 }
 return <section className="restaurantPanel" dir="rtl" aria-label="تشغيل خصائص واجهة العملاء" style={{marginBlock:18}}>
  <header><div><h3>التحكم في خصائص واجهة العملاء</h3><p>كل خاصية مستقلة لنشاطك. إيقافها يمنع تنفيذها من واجهة العميل والخادم، ولا يحذف أي طلب سابق.</p></div></header>
  {message&&<p role="status">{message}</p>}
  {groups.map(group=><div key={group.title} style={{marginBlock:16}}>
   <h4>{group.title}</h4><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))",gap:10}}>
    {group.entries.filter(entry=>activity==="restaurant"||!["waiter","dineIn","roomService"].includes(entry.key)).map(entry=><label key={entry.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:12,border:"1px solid #ccd3dc",borderRadius:12,cursor:ready&&!busy?"pointer":"default"}}>
     <span>{entry.ar}</span><input type="checkbox" aria-label={entry.ar} disabled={!ready||busy} checked={controls[entry.key]} onChange={e=>void change(entry.key,e.target.checked)} style={{width:20,height:20,flexShrink:0}}/>
    </label>)}
   </div>
  </div>)}
  <p style={{fontSize:12,opacity:.75}}>إيقاف البيع يلغي إتاحة السلة وتنفيذ الطلب مهما كان إعداد السلة. عند إعادة التفعيل تستمر إعدادات كل قناة مستقلة.</p>
 </section>
}
