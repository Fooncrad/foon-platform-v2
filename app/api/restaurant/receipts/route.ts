import {randomBytes} from 'node:crypto';
import {NextResponse} from 'next/server';
import type {RowDataPacket} from 'mysql2/promise';
import {currentUserId} from '@/lib/auth/session';
import {database} from '@/lib/db/mysql';
import {assertSameOrigin} from '@/lib/security/origin';
import {canReadStaffReceipt} from '@/lib/restaurant/receipt-authorization';
import {finalReceiptEligible} from '@/lib/restaurant/final-receipt-policy';
export const runtime='nodejs';
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false},{status:403});}
 const user=await currentUserId(),tenant=request.headers.get('x-foon-tenant');if(!user||!tenant)return NextResponse.json({ok:false},{status:401});
 const body=await request.json().catch(()=>null);if(typeof body?.id!=='string'||!/^[a-f0-9-]{36}$/i.test(body.id))return NextResponse.json({ok:false},{status:400});
 const db=await database().getConnection();
 try{
  await db.beginTransaction();
  const [rows]=await db.execute<RowDataPacket[]>("SELECT id,branch_id,customer_user_id,checkout_snapshot,status,payment_status FROM restaurant_orders WHERE tenant_id=? AND id=? FOR UPDATE",[tenant,body.id]);
  const order=rows[0];if(!order||!await canReadStaffReceipt(user,tenant,String(order.branch_id))){await db.rollback();return NextResponse.json({ok:false},{status:404});}
  if(!finalReceiptEligible(order.status,order.payment_status)){await db.rollback();return NextResponse.json({ok:false,code:"RECEIPT_NOT_FINAL"},{status:409,headers:{"Cache-Control":"no-store"}});}
  const [stores]=await db.execute<RowDataPacket[]>("SELECT t.slug,r.data FROM tenants t LEFT JOIN restaurant_resources r ON r.tenant_id=t.id AND r.kind='storefront_config' AND r.status='active' AND r.archived=FALSE WHERE t.id=? ORDER BY r.created_at DESC LIMIT 1",[tenant]);
  if(!stores.length){await db.rollback();return NextResponse.json({ok:false},{status:404});}
  const settings=stores[0].data?(typeof stores[0].data==='string'?JSON.parse(stores[0].data):stores[0].data):{};
  const destination=['storefront','pos'].includes(settings.receiptQrDestination)?settings.receiptQrDestination:'receipt';
  if(destination==='pos'){
   const path='/receipts/'+order.id+'?view=pos';
   await db.commit();return NextResponse.json({ok:true,path,destination},{headers:{'Cache-Control':'no-store'}});
  }
  let path='/receipts/'+order.id;
  if(order.customer_user_id===null){
   const snapshot=order.checkout_snapshot?(typeof order.checkout_snapshot==='string'?JSON.parse(order.checkout_snapshot):order.checkout_snapshot):{version:0,seller:{name:'',taxNumber:'',address:'',phone:''}};
   if(typeof snapshot.receiptKey!=='string'||!/^[a-f0-9]{64}$/.test(snapshot.receiptKey)){
    snapshot.receiptKey=randomBytes(32).toString('hex');
    await db.execute('UPDATE restaurant_orders SET checkout_snapshot=? WHERE tenant_id=? AND id=?',[JSON.stringify(snapshot),tenant,order.id]);
    await db.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?,'receipt.link.create',?,'{}')",[tenant,user,order.id]);
   }
   path+='?key='+snapshot.receiptKey;
  }
  if(destination==='storefront'){const query=new URLSearchParams({receipt:String(order.id)});const key=new URL(path,'http://local').searchParams.get('key');if(key)query.set('key',key);path='/'+encodeURIComponent(String(stores[0].slug))+'#'+query.toString();}
  await db.commit();return NextResponse.json({ok:true,path,destination},{headers:{'Cache-Control':'no-store'}});
 }catch{await db.rollback();return NextResponse.json({ok:false},{status:503});}finally{db.release();}
}
