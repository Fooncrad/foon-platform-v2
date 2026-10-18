"use client";
import {useUiText} from "@/lib/i18n/ui-language";
import {useEffect,useState} from "react";
type Receipt={receipt_number:string;tenant_name:string;amount:string;currency:string;issued_at:string};
function printReceipt(row:Receipt,translate:(value:string)=>string){
 const popup=window.open("","_blank","width=440,height=640");
 if(!popup)throw new Error(translate("اسمح بالنوافذ المنبثقة لطباعة الإيصال."));
 const doc=popup.document;doc.title=translate("إيصال اشتراك FOON");
 const style=doc.createElement("style");style.textContent="@page{size:80mm auto;margin:5mm}body{font:15px Arial,sans-serif;max-width:70mm;margin:0 auto;color:#111;direction:"+(document.documentElement.lang==="ar"?"rtl":"ltr")}h1{text-align:center;font-size:20px}p{display:flex;justify-content:space-between;gap:12px;border-bottom:1px dashed #aaa;padding:8px 0}.value{font-weight:700;text-align:end}";doc.head.appendChild(style);
 const heading=doc.createElement("h1");heading.textContent=translate("إيصال اشتراك FOON");doc.body.appendChild(heading);
 const fields:[[string,string],[string,string],[string,string],[string,string]]=[["رقم الإيصال",row.receipt_number],["المنشأة",row.tenant_name],["المبلغ",row.amount+" "+row.currency],["تاريخ الإصدار",new Date(row.issued_at).toLocaleString("en-GB")]];
 for(const [label,value] of fields){const p=doc.createElement("p"),name=doc.createElement("span"),content=doc.createElement("span");name.textContent=translate(label);content.textContent=value;content.className="value";p.append(name,content);doc.body.appendChild(p);}
 popup.focus();popup.print();
}
export default function Receipts(){
 const translateUi=useUiText();

 const [rows,setRows]=useState<Receipt[]>([]),[error,setError]=useState("");
 useEffect(()=>{let active=true;fetch("/api/admin/billing/receipts").then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.code);if(active)setRows(j.receipts??[]);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[]);
 return <section className="adminPanel"><div className="adminPanelHead"><div><h2>{translateUi("إيصالات المدفوعات المعتمدة")}</h2><p>{translateUi("إيصالات إدارية للتحويلات؛ ليست فواتير ضريبية إلكترونية.")}</p></div></div>{error?<p role="alert">{translateUi("تعذر تحميل الإيصالات:")} {error}</p>:rows.length===0?<p>{translateUi("لا توجد إيصالات معروضة.")}</p>:<div className="adminDataTableWrap"><table className="adminDataTable"><thead><tr><th>{translateUi("رقم الإيصال")}</th><th>{translateUi("المنشأة")}</th><th>{translateUi("المبلغ")}</th><th>{translateUi("تاريخ الإصدار")}</th><th>{translateUi("إجراء")}</th></tr></thead><tbody>{rows.map(r=><tr key={r.receipt_number}><td dir="ltr">{r.receipt_number}</td><td>{r.tenant_name}</td><td>{r.amount} {r.currency}</td><td>{new Date(r.issued_at).toLocaleString("en-GB")}</td><td><button type="button" className="adminPrimaryLink" onClick={()=>{try{printReceipt(r,translateUi);}catch(e){setError(String(e));}}}>{translateUi("طباعة الإيصال")}</button></td></tr>)}</tbody></table></div>}</section>;
}
