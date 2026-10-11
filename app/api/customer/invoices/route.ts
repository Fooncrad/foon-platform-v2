import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
export const runtime="nodejs";

// Invoice archive is visible only to the authenticated customer owning the order.
export async function GET(){
 const user=await currentUserId();
 if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{
  const [rows]=await database().execute<RowDataPacket[]>(
   "SELECT i.id,i.invoice_number,i.invoice_kind,i.invoice_json,i.currency,i.total,i.issued_at,i.email_status,o.order_number,t.slug AS store_slug FROM restaurant_customer_invoices i JOIN restaurant_orders o ON o.id=i.order_id AND o.tenant_id=i.tenant_id JOIN tenants t ON t.id=i.tenant_id WHERE i.customer_user_id=? AND o.customer_user_id=? ORDER BY i.issued_at DESC LIMIT 100",
   [user,user]
  );
  return NextResponse.json({ok:true,invoices:rows.map(row=>({...row,invoice_json:typeof row.invoice_json==="string"?JSON.parse(row.invoice_json):row.invoice_json}))});
 }catch{return NextResponse.json({ok:false,code:"INVOICES_UNAVAILABLE"},{status:503});}
}
