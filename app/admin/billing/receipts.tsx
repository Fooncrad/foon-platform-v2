"use client";
import {useEffect,useState} from "react";
type Receipt={receipt_number:string;tenant_name:string;amount:string;currency:string;issued_at:string};
export default function Receipts(){
 const [rows,setRows]=useState<Receipt[]>([]),[error,setError]=useState("");
 useEffect(()=>{let active=true;fetch("/api/admin/billing/receipts").then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.code);if(active)setRows(j.receipts??[]);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[]);
 return <section className="adminPanel"><div className="adminPanelHead"><div><h2>إيصالات المدفوعات المعتمدة</h2><p>إيصالات إدارية للتحويلات؛ ليست فواتير ضريبية إلكترونية.</p></div></div>{error?<p role="alert">تعذر تحميل الإيصالات: {error}</p>:rows.length===0?<p>لا توجد إيصالات معروضة.</p>:<div className="adminDataTableWrap"><table className="adminDataTable"><thead><tr><th>رقم الإيصال</th><th>المنشأة</th><th>المبلغ</th><th>تاريخ الإصدار</th></tr></thead><tbody>{rows.map(r=><tr key={r.receipt_number}><td dir="ltr">{r.receipt_number}</td><td>{r.tenant_name}</td><td>{r.amount} {r.currency}</td><td>{new Date(r.issued_at).toLocaleString("en-GB")}</td></tr>)}</tbody></table></div>}</section>;
}
