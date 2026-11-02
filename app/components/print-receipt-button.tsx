"use client";
export default function PrintReceiptButton({label}:{label:string}){
 return <button type="button" onClick={()=>window.print()} className="receiptPrintButton" style={{marginBlock:16,padding:"10px 16px",borderRadius:8,cursor:"pointer"}}>{label}</button>;
}
