import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {dispatchNotifications} from "@/lib/notifications/dispatch";
import {NextResponse} from "next/server";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {randomUUID} from "node:crypto";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {createOrder} from "@/lib/restaurant/operations";
import {ResourceError} from "@/scripts/restaurant-resource-schema.mjs";
import {customerCartAvailable,deliveryCountryMatches} from "@/lib/platform/customer-checkout";
import {tenantPublicControls,channelControl,publicControlAllowed} from "@/lib/tenant/public-controls";
import {allowedDeliveryCountries} from "@/lib/tenant/international-shipping";
import {saveCheckoutDeliveryAddress} from "@/lib/tenant/delivery-address-sync";
import {deliveryZoneCheck} from "@/lib/tenant/free-location";
export const runtime="nodejs";
async function queueDeliveryDriverAlerts(db:PoolConnection,tenantId:string){
 await db.execute("SELECT id FROM tenants WHERE id=? FOR UPDATE",[tenantId]);
 const [staff]=await db.execute<RowDataPacket[]>("SELECT DISTINCT u.email FROM memberships m JOIN users u ON u.id=m.user_id AND u.status='active' WHERE m.tenant_id=? AND m.role IN ('owner','manager') AND m.status='active'",[tenantId]);
 const recipients=new Set<string>(staff.map(row=>String(row.email).trim().toLowerCase()).filter(Boolean));
 const platformEmail=String(process.env.PLATFORM_ADMIN_EMAIL??"").trim().toLowerCase();if(platformEmail)recipients.add(platformEmail);
 for(const email of recipients){
  const [[recent]]=await db.execute<RowDataPacket[]>("SELECT id FROM platform_notification_outbox WHERE tenant_id=? AND event_key='delivery_driver_unavailable' AND recipient_email=? AND created_at>=DATE_SUB(NOW(),INTERVAL 30 MINUTE) LIMIT 1",[tenantId,email]);
  if(recent)continue;
  await db.execute("INSERT INTO platform_notification_outbox(id,event_key,tenant_id,recipient_email,subject,body_text) VALUES (?,'delivery_driver_unavailable',?,?,?,?)",[randomUUID(),tenantId,email,"Delivery unavailable: assign a driver","A delivery order could not be placed because this branch has no active, available driver assigned. Assign an active driver to the branch. No customer details are included.\n\nتعذر تسجيل طلب توصيل لعدم وجود سائق نشط ومتاح للفرع. يرجى تعيين سائق نشط. لم تُرفق بيانات العميل."]);
 }
}
export async function POST(request:Request){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object"||typeof body.storeSlug!=="string")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 let tenantIdForAlert:string|null=null;
 try{
  await db.query("SET time_zone='+00:00'");await db.beginTransaction();
  // Acquire the same exclusive customer lock used by createOrder before any
  // joined shared reads; concurrent retries must not deadlock on lock upgrade.
  const [actors]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",[user]);
  if(!actors.length)throw new ResourceError("STORE_CUSTOMER_REQUIRED");
  const [stores]=await db.execute<RowDataPacket[]>("SELECT t.id,t.kind,b.activity_code,b.country_code,u.display_name FROM tenants t LEFT JOIN tenant_business_profiles b ON b.tenant_id=t.id JOIN tenant_customers c ON c.tenant_id=t.id AND c.user_id=? JOIN users u ON u.id=c.user_id AND u.status='active' WHERE t.slug=? AND t.status='active' LIMIT 1 LOCK IN SHARE MODE",[user,body.storeSlug]);
  if(!stores.length)throw new ResourceError("STORE_CUSTOMER_REQUIRED");const tenantId=String(stores[0].id);tenantIdForAlert=tenantId;
  if(!customerCartAvailable(String(stores[0].activity_code??""),String(stores[0].kind)))throw new ResourceError("CART_NOT_AVAILABLE");
  const publicControls=await tenantPublicControls(tenantId,db);
  if(!publicControlAllowed(publicControls,"cart"))throw new ResourceError("PUBLIC_FEATURE_DISABLED");
  const requestedControl=channelControl[String(body.channel??"")];
  if(requestedControl&&!publicControlAllowed(publicControls,requestedControl))throw new ResourceError("PUBLIC_FEATURE_DISABLED");
  if(body.reservationId&&!publicControls.reservations)throw new ResourceError("PUBLIC_FEATURE_DISABLED");
  if(!(await tenantEntitlement(tenantId,"orders",db)).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
  if(body.couponCode&&!(await tenantEntitlement(tenantId,"coupons",db)).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
  if(body.channel==="dine_in"&&!(await tenantEntitlement(tenantId,"tables",db)).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
  if(body.channel==="room_service"&&!(await tenantEntitlement(tenantId,"room_service",db)).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
  const [profiles]=await db.execute<RowDataPacket[]>("SELECT phone FROM user_profiles WHERE user_id=? LIMIT 1",[user]);
  const customerPhone=typeof body.customerPhone==="string"&&body.customerPhone.trim()?body.customerPhone.trim():String(profiles[0]?.phone||"");
  const catalogDelivery=body.channel==="delivery"&&String(stores[0].activity_code??"")!=="restaurant"&&Boolean(stores[0].activity_code);
  if(catalogDelivery&&(typeof body.deliveryAddress!=="string"||body.deliveryAddress.trim().length<5||body.deliveryAddress.length>900||!/^\+?[\d ()-]{7,40}$/.test(customerPhone)||customerPhone.replace(/\D/g,"").length<7))throw new ResourceError("DELIVERY_DETAILS_REQUIRED");
   if(catalogDelivery&&(typeof body.deliveryCity!=="string"||body.deliveryCity.trim().length<2||body.deliveryCity.trim().length>120))throw new ResourceError("DELIVERY_DETAILS_REQUIRED");
  if(body.channel==="delivery"){const destination=String(body.deliveryCountryCode??"").trim().toUpperCase();const approved=await allowedDeliveryCountries(tenantId,String(stores[0].country_code??""),String(stores[0].activity_code??""),db);if(!approved.includes(destination))throw new ResourceError("DELIVERY_COUNTRY_MISMATCH");}
  if(body.channel==="delivery"){
   const [zones]=await db.execute<RowDataPacket[]>(
    "SELECT delivery_mode,latitude,longitude,radius_km FROM tenant_location_settings WHERE tenant_id=? LIMIT 1",
    [tenantId]);
   const zone=zones[0];
   if(zone&&zone.delivery_mode==="radius"){
    const decision=deliveryZoneCheck({
     deliveryMode:"radius",
     latitude:zone.latitude===null?null:Number(zone.latitude),
     longitude:zone.longitude===null?null:Number(zone.longitude),
     radiusKm:zone.radius_km===null?null:Number(zone.radius_km)
    },body.latitude,body.longitude);
    if(!decision.allowed)throw new ResourceError(decision.code);
   }
  }
  if(catalogDelivery)await db.execute("INSERT INTO user_profiles(user_id,phone) VALUES (?,?) ON DUPLICATE KEY UPDATE phone=VALUES(phone)",[user,customerPhone]);
  const orderNotes=catalogDelivery?"Delivery address: "+body.deliveryAddress.trim():body.orderNotes;
  const result=await createOrder(db,tenantId,user,{...body,orderNotes,customerPhone,customerName:String(stores[0].display_name||"عميل")},user);
  if(catalogDelivery)await saveCheckoutDeliveryAddress(db,user,{countryCode:body.deliveryCountryCode,city:body.deliveryCity,address:body.deliveryAddress,phone:customerPhone,latitude:body.latitude,longitude:body.longitude});
  await db.commit();dispatchNotifications();return NextResponse.json({ok:true,...result},{status:201});
 }catch(error){await db.rollback();const code=error instanceof ResourceError?error.code:"ORDER_UNAVAILABLE";if(code==="DELIVERY_DRIVER_UNAVAILABLE"&&tenantIdForAlert){try{await db.beginTransaction();await queueDeliveryDriverAlerts(db,tenantIdForAlert);await db.commit();dispatchNotifications();}catch{await db.rollback();}}return NextResponse.json({ok:false,code},{status:code==="STORE_CUSTOMER_REQUIRED"||code==="PLAN_FEATURE_REQUIRED"||code==="CART_NOT_AVAILABLE"||code==="PUBLIC_FEATURE_DISABLED"?403:code==="DELIVERY_DRIVER_UNAVAILABLE"||code==="RESERVATION_NOT_AVAILABLE"||code==="RESERVATION_ALREADY_ORDERED"||code==="HOTEL_ROOM_UNAVAILABLE"?409:code==="ORDER_UNAVAILABLE"?503:400});}finally{db.release();}
}
