import {cookies} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import Link from 'next/link';
import type {RowDataPacket} from 'mysql2/promise';
import {database} from '@/lib/db/mysql';
import {currentUserId} from '@/lib/auth/session';
import {timingSafeEqual} from 'node:crypto';
import {canReadStaffReceipt} from '@/lib/restaurant/receipt-authorization';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function ReceiptPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{key?:string;view?:string;store?:string}>}){
 const {id}=await params;if(!/^[a-f0-9-]{36}$/i.test(id))notFound();
 const {key,view,store}=await searchParams,user=await currentUserId(),returnPath='/receipts/'+id+(view==='pos'?'?view=pos':'');
 if(!user&&!key)redirect('/login?next='+encodeURIComponent(returnPath));
 const db=database();
 const [rows]=await db.execute<RowDataPacket[]>("SELECT o.*,t.name AS store_name,t.slug AS store_slug FROM restaurant_orders o JOIN tenants t ON t.id=o.tenant_id AND t.status='active' WHERE o.id=? AND o.payment_status IN ('paid','refunded') LIMIT 1",[id]);
 const order=rows[0];if(!order||store&&store!==order.store_slug)notFound();
 if(view==='pos'){
  if(!user)redirect('/login?next='+encodeURIComponent(returnPath));
  if(!await canReadStaffReceipt(user,String(order.tenant_id),String(order.branch_id)))notFound();
  redirect('/restaurant?tenant='+encodeURIComponent(String(order.tenant_id))+'&section=pos');
 }
 const snapshot=order.checkout_snapshot?(typeof order.checkout_snapshot==='string'?JSON.parse(order.checkout_snapshot):order.checkout_snapshot):null;
 const guestAccess=order.customer_user_id===null&&typeof key==='string'&&/^[a-f0-9]{64}$/.test(key)&&typeof snapshot?.receiptKey==='string'&&/^[a-f0-9]{64}$/.test(snapshot.receiptKey)&&timingSafeEqual(Buffer.from(key,'hex'),Buffer.from(snapshot.receiptKey,'hex'));
 if(!guestAccess){
  if(key)notFound();
  if(!user)redirect('/login?next='+encodeURIComponent(returnPath));
  const [active]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active'",[user]);
  if(!active.length||order.customer_user_id!==user&&!await canReadStaffReceipt(user,String(order.tenant_id),String(order.branch_id)))notFound();
 }
 const [items]=await db.execute<RowDataPacket[]>('SELECT item_name,quantity,unit_price,line_total FROM restaurant_order_items WHERE tenant_id=? AND order_id=? ORDER BY id',[order.tenant_id,id]);
 const locale=(await cookies()).get('foon_language')?.value,language=locale==='en'||locale==='fr'?locale:'ar';
 const t=(ar:string,en:string,fr:string)=>language==='ar'?ar:language==='en'?en:fr;

 const seller=snapshot?.seller??{},money=(value:unknown)=>Number(value).toFixed(2)+' '+String(order.currency);
 const totals=[[t('المجموع قبل الخصم','Subtotal before discount','Sous-total avant remise'),order.subtotal],[t('الخصم','Discount','Remise'),order.discount],...(snapshot?.version===1?[[t('رسوم الخدمة','Service fee','Frais de service'),snapshot.serviceFee],[t('رسوم التوصيل','Delivery fee','Frais de livraison'),snapshot.deliveryFee],[t('الصافي دون الضريبة','Net excluding tax','Net hors taxes'),snapshot.net],[t('الضريبة','Tax','Taxe'),snapshot.tax]]:[]),[t('الإجمالي','Total','Total'),order.total]];
 return <main lang={language} dir={language==='ar'?'rtl':'ltr'} style={{maxWidth:720,margin:'auto',padding:20,overflowWrap:'anywhere'}}>{!guestAccess&&<Link href='/account'>{t('حسابي','My account','Mon compte')}</Link>}<h1>{t('إيصال الدفع','Payment receipt','Reçu de paiement')} #{String(order.order_number)}</h1><h2>{String(seller.name||order.store_name)}</h2>{[seller.address,seller.phone,seller.taxNumber].filter(Boolean).map((v,index)=><p key={index}>{String(v)}</p>)}<p>{t('حالة الدفع','Payment status','État du paiement')}: {order.payment_status==='paid'?t('مدفوع','Paid','Payé'):t('تم رد المبلغ','Refunded','Remboursé')}</p><time>{new Date(order.created_at).toLocaleString(language+'-u-nu-latn')}</time><div style={{maxWidth:'100%',overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{[t('الصنف','Item','Article'),t('الكمية','Quantity','Quantité'),t('سعر الوحدة','Unit price','Prix unitaire'),t('المبلغ','Amount','Montant')].map(label=><th key={label} style={{textAlign:'start',padding:8}}>{label}</th>)}</tr></thead><tbody>{items.map((item,index)=><tr key={index}><td style={{padding:8}}>{String(item.item_name)}</td><td dir='ltr'>{Number(item.quantity)}</td><td dir='ltr'>{money(item.unit_price)}</td><td dir='ltr'>{money(item.line_total)}</td></tr>)}</tbody></table></div><dl style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12}}>{totals.map(([label,value])=><div key={String(label)} style={{display:'contents'}}><dt>{String(label)}</dt><dd dir='ltr' style={{margin:0}}>{money(value)}</dd></div>)}</dl><p>{t('إيصال دفع وليس فاتورة ضريبية معتمدة.','Payment receipt, not a certified tax invoice.','Reçu de paiement, pas une facture fiscale certifiée.')}</p></main>;
}
