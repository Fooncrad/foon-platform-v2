"use client";
import {useEffect,useState} from "react";
type Item={id:string;event_key:string;recipient_email:string;subject:string;status:string;attempts:number;last_error:string|null};
export default function NotificationOutbox(){
 const [items,setItems]=useState<Item[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState("");
 async function load(){const r=await fetch("/api/admin/notifications/outbox");const j=await r.json();if(!r.ok)throw Error(j.code);setItems(j.items??[]);}
 useEffect(()=>{let live=true;fetch("/api/admin/notifications/outbox").then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.code);if(live)setItems(j.items??[]);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[]);
 async function retry(id:string){setBusy(id);setError("");try{const r=await fetch("/api/admin/notifications/outbox",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id})});const j=await r.json();if(!r.ok)throw Error(j.code);await load();}catch(e){setError(String(e));}finally{setBusy("");}}
 return <section className="adminPanel"><div className="adminPanelHead"><div><h2>سجل إرسال الرسائل</h2><p>مراقبة طابور الإرسال وإعادة جدولة الرسائل الفاشلة. يتطلب الإرسال الفعلي عامل بريد مهيأ.</p></div></div>{error&&<p role="alert">{error}</p>}{items.length===0?<p>لا توجد رسائل معروضة.</p>:<div style={{overflowX:"auto"}}><table style={{width:"100%"}}><thead><tr><th>الحدث</th><th>المستلم</th><th>الحالة</th><th>المحاولات</th><th>الإجراء</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td>{x.event_key}</td><td dir="ltr">{x.recipient_email}</td><td>{x.status}{x.last_error&&<small> — {x.last_error}</small>}</td><td>{x.attempts}</td><td>{x.status==="failed"&&<button disabled={busy===x.id} onClick={()=>retry(x.id)}>إعادة المحاولة</button>}</td></tr>)}</tbody></table></div>}</section>;
}
