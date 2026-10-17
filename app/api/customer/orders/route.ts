import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {dispatchNotifications} from "@/lib/notifications/dispatch";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {createOrder} from "@/lib/restaurant/operations";
import {ResourceError} from "@/scripts/restaurant-resource-schema.mjs";
import {customerCartAvailable} from "@/lib/platform/customer-checkout";
export const runtime="nodejs";
export async function POST(request:Request){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object"||typeof body.storeSlug!=="string")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  await db.query("SET time_zone='+00:00'");await db.beginTransaction();
  // Acquire the same exclusive customer lock used by createOrder before any
  // joined shared reads; concurrent retries must not deadlock on lock upgrade.
  const [actors]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",[user]);
  if(!actors.length)throw new ResourceError("STORE_CUSTOMER_REQUIRED");
  const [stores]=await db.execute<RowDataPacket[]>("SELECT t.id,t.kind,b.activity_code,u.display_name FROM tenants t LEFT JOIN tenant_business_profiles b ON b.tenant_id=t.id JOIN tenant_customers c ON c.tenant_id=t.id AND c.user_id=? JOIN users u ON u.id=c.user_id AND u.status='active' WHERE t.slug=? AND t.status='active' LIMIT 1 LOCK IN SHARE MODE",[user,body.storeSlug]);
  if(!stores.length)throw new ResourceError("STORE_CUSTOMER_REQUIRED");const tenantId=String(stores[0].id);
  if(!customerCartAvailable(String(stores[0].activity_code??""),String(stores[0].kind)))throw new ResourceError("CART_NOT_AVAILABLE");
  if(!(await tenantEntitlement(tenantId,"orders",db)).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
  if(body.couponCode&&!(await tenantEntitlement(tenantId,"coupons",db)).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
  if(body.channel==="dine_in"&&!(await tenantEntitlement(tenantId,"tables",db)).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
  const [profiles]=await db.execute<RowDataPacket[]>("SELECT phone FROM user_profiles WHERE user_id=? LIMIT 1",[user]);
  const customerPhone=typeof body.customerPhone==="string"&&body.customerPhone.trim()?body.customerPhone.trim():String(profiles[0]?.phone||"");
  const catalogDelivery=body.channel==="delivery"&&String(stores[0].activity_code??"")!=="restaurant"&&Boolean(stores[0].activity_code);
  if(catalogDelivery&&(typeof body.deliveryAddress!=="string"||body.deliveryAddress.trim().length<5||body.deliveryAddress.length>900||!/^\+?[\d ()-]{7,40}$/.test(customerPhone)||customerPhone.replace(/\D/g,"").length<7))throw new ResourceError("DELIVERY_DETAILS_REQUIRED");
  if(catalogDelivery)await db.execute("INSERT INTO user_profiles(user_id,phone) VALUES (?,?) ON DUPLICATE KEY UPDATE phone=VALUES(phone)",[user,customerPhone]);
  const orderNotes=catalogDelivery?"Delivery address: "+body.deliveryAddress.trim():body.orderNotes;
  const result=await createOrder(db,tenantId,user,{...body,orderNotes,customerPhone,customerName:String(stores[0].display_name||"عميل")},user);
  await db.commit();dispatchNotifications();return NextResponse.json({ok:true,...result},{status:201});
 }catch(error){await db.rollback();const code=error instanceof ResourceError?error.code:"ORDER_UNAVAILABLE";return NextResponse.json({ok:false,code},{status:code==="STORE_CUSTOMER_REQUIRED"||code==="PLAN_FEATURE_REQUIRED"||code==="CART_NOT_AVAILABLE"?403:code==="ORDER_UNAVAILABLE"?503:400});}finally{db.release();}
}
