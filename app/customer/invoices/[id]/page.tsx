import {notFound,redirect} from "next/navigation";
import {cookies} from "next/headers";
import Link from "next/link";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {isEmployeeAccount} from "@/lib/auth/account-surface";
import {database} from "@/lib/db/mysql";
import StandaloneThemeShell from "@/app/components/standalone-theme-shell";
import PrintReceiptButton from "@/app/components/print-receipt-button";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false},referrer:"no-referrer" as const};
type Line={name:string;quantity:number;unitPrice:string;total:string;options?:unknown};
export default async function CustomerInvoicePage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const user=await currentUserId();
 if(!user)redirect("/login?next="+encodeURIComponent("/customer/invoices/"+id));
 if(await isEmployeeAccount(user))notFound();
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT i.id,i.invoice_number,i.invoice_kind,i.invoice_json,i.total,i.currency,i.issued_at,i.email_status,o.order_number,o.payment_status,t.name AS store_name "+
  "FROM restaurant_customer_invoices i JOIN restaurant_orders o ON o.id=i.order_id AND o.tenant_id=i.tenant_id "+
  "JOIN tenants t ON t.id=i.tenant_id JOIN users u ON u.id=i.customer_user_id AND u.status='active' "+
  "WHERE i.id=? AND i.customer_user_id=? AND o.customer_user_id=? LIMIT 1",[id,user,user]);
 const invoice=rows[0];if(!invoice)notFound();
 let snapshot:Record<string,unknown>={};
 try{const raw=typeof invoice.invoice_json==="string"?JSON.parse(invoice.invoice_json):invoice.invoice_json;
  if(raw&&typeof raw==="object"&&!Array.isArray(raw))snapshot=raw;
 }catch{notFound();}
 const lines:Array<Line>=Array.isArray(snapshot.lines)?snapshot.lines.filter((v:unknown)=>v&&typeof v==="object").map((v:unknown)=>{
  const item=v as Record<string,unknown>;
  return {name:String(item.name??""),quantity:Number(item.quantity??0),unitPrice:String(item.unitPrice??0),total:String(item.total??0)};
 }):[];
 const seller=snapshot.seller&&typeof snapshot.seller==="object"&&!Array.isArray(snapshot.seller)?snapshot.seller as Record<string,unknown>:{};
 const lang=(await cookies()).get("foon_language")?.value,locale=lang==="en"||lang==="fr"?lang:"ar";
 const t=(ar:string,en:string,fr:string)=>locale==="en"?en:locale==="fr"?fr:ar;
 const money=(value:unknown)=>Number(value??0).toFixed(2)+" "+String(invoice.currency);
 const issued=new Date(invoice.issued_at);
 const sums:[string,unknown][]=[[t("المجموع الفرعي","Subtotal","Sous-total"),snapshot.subtotal],
  [t("الخصم","Discount","Remise"),snapshot.discount]];
 if(snapshot.serviceFee!==null&&snapshot.serviceFee!==undefined)sums.push([t("رسوم الخدمة","Service fee","Frais de service"),snapshot.serviceFee]);
 if(snapshot.deliveryFee!==null&&snapshot.deliveryFee!==undefined)sums.push([t("رسوم التوصيل","Delivery fee","Frais de livraison"),snapshot.deliveryFee]);
 if(snapshot.tax!==null&&snapshot.tax!==undefined)sums.push([t("الضريبة حسب بيانات الطلب","Tax per checkout record","Taxes selon la commande"),snapshot.tax]);
 sums.push([t("الإجمالي المدفوع","Total paid","Total payé"),invoice.total]);
 return <StandaloneThemeShell>
  <main lang={locale} dir={locale==="ar"?"rtl":"ltr"} style={{maxWidth:760,margin:"24px auto",padding:24,overflowWrap:"anywhere"}}>
   <style>{`@media print {.receiptPrintButton,.receiptPrintNav{display:none!important} body{background:white!important;color:black!important} main{margin:0!important;padding:0!important}}`}</style>
   <nav className="receiptPrintNav"><Link href="/customer#customer-invoices">{t("رجوع إلى فواتيري","Back to my invoices","Retour aux reçus")}</Link></nav>
   <PrintReceiptButton label={t("طباعة / حفظ PDF","Print / Save as PDF","Imprimer / enregistrer en PDF")}/>
   <h1>{t("إيصال الطلب","Order payment receipt","Reçu de commande")}</h1>
   <p><strong dir="ltr">{String(invoice.invoice_number)}</strong></p>
   <h2>{String(seller.name??invoice.store_name)}</h2>
   {["address","phone","taxNumber"].filter(key=>seller[key]!==null&&seller[key]!==undefined&&String(seller[key]).trim()).map(key=><p key={key}>{String(seller[key])}</p>)}
   <p>{t("رقم الطلب","Order number","N° de commande")}: <b dir="ltr">{String(invoice.order_number)}</b></p>
   <p>{t("تاريخ الإصدار","Issued at","Date d'émission")}: <time dateTime={issued.toISOString()}>{issued.toLocaleString(locale==="ar"?"ar-SA-u-nu-latn":locale==="fr"?"fr-FR":"en-GB")}</time></p>
   {invoice.payment_status==="refunded"&&<p role="status">{t("تم رد المبلغ لاحقًا. هذا الإيصال يمثل عملية السداد الأصلية.","Payment was subsequently refunded; this is the original payment record.","Paiement remboursé ensuite ; ce reçu atteste le règlement initial.")}</p>}
   <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
    {[t("الصنف","Item","Article"),t("الكمية","Qty","Qté"),t("سعر الوحدة","Unit price","Prix unitaire"),t("الإجمالي","Line total","Total")].map(v=><th key={v} style={{padding:8,textAlign:"start",borderBottom:"1px solid"}}>{v}</th>)}
   </tr></thead><tbody>{lines.map((line,i)=><tr key={i}><td style={{padding:8}}>{line.name}</td><td dir="ltr">{line.quantity}</td><td dir="ltr">{money(line.unitPrice)}</td><td dir="ltr">{money(line.total)}</td></tr>)}</tbody></table></div>
   <dl style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",columnGap:20,rowGap:12}}>{sums.map(([key,value])=><div key={key} style={{display:"contents"}}><dt>{key}</dt><dd style={{margin:0}} dir="ltr">{money(value)}</dd></div>)}</dl>
   <p>{t("هذا إيصال سداد محفوظ، وليس فاتورة ضريبية معتمدة. لا تتغير تفاصيله إذا تعدل الطلب لاحقًا.","This is an immutable payment receipt, not a certified tax invoice.","Il s'agit d'un reçu de paiement conservé, et non d'une facture fiscale certifiée.")}</p>
  </main>
 </StandaloneThemeShell>;
}
