import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {addressFromStoredFields} from "@/lib/tenant/delivery-address-sync";
import {nearestDeliveryBranch} from "@/lib/tenant/nearest-delivery-branch.mjs";
import {allowedDeliveryCountries} from "@/lib/tenant/international-shipping";
import type {RowDataPacket} from "mysql2/promise";
export const runtime="nodejs";
export async function GET(request:Request){
 const denied=await employeePersonalAccessDenied();if(denied)return denied;
 const user=await currentUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 const slug=new URL(request.url).searchParams.get("storeSlug")??"";
 if(!/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/.test(slug))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{
  const db=database();
  const [tenants]=await db.execute<RowDataPacket[]>("SELECT t.id,p.country_code,p.activity_code FROM tenants t JOIN tenant_business_profiles p ON p.tenant_id=t.id JOIN tenant_customers c ON c.tenant_id=t.id AND c.user_id=? WHERE t.slug=? AND t.status='active' LIMIT 1",[user,slug]);
  if(!tenants.length)return NextResponse.json({ok:false,code:"STORE_CUSTOMER_REQUIRED"},{status:403});
  const tenant=tenants[0],countries=await allowedDeliveryCountries(String(tenant.id),String(tenant.country_code),String(tenant.activity_code),db);
  const [addresses]=countries.length?await db.execute<RowDataPacket[]>("SELECT country_code,city,district,street_address,delivery_notes,latitude,longitude,phone FROM customer_delivery_addresses WHERE user_id=? AND country_code IN ("+countries.map(()=>"?").join(",")+") ORDER BY is_default DESC,updated_at DESC LIMIT 1",[user,...countries]):[[] as RowDataPacket[]];
  const [branches]=await db.execute<RowDataPacket[]>("SELECT b.id,b.name,l.latitude,l.longitude FROM branches b LEFT JOIN branch_delivery_locations l ON l.branch_id=b.id AND l.tenant_id=b.tenant_id WHERE b.tenant_id=? AND b.enabled=TRUE ORDER BY b.created_at,b.id",[tenant.id]);
  const address=addresses[0];
  const coords=address&&address.latitude!==null&&address.longitude!==null?{latitude:Number(address.latitude),longitude:Number(address.longitude)}:null;
  const places=branches.map(b=>({id:String(b.id),name:String(b.name),latitude:b.latitude===null?null:Number(b.latitude),longitude:b.longitude===null?null:Number(b.longitude)}));
  const closest=nearestDeliveryBranch(places,coords,places.map(b=>b.id));
  return NextResponse.json({ok:true,address:address?{countryCode:String(address.country_code),city:String(address.city),street:String([address.district,addressFromStoredFields(address.street_address,address.delivery_notes)].filter(Boolean).join("، ")),phone:String(address.phone??""),...(coords??{})}:null,branches:places,preferredBranchId:closest&&!closest.approximate?closest.branch.id:null,approximateDistanceKm:closest&&!closest.approximate?closest.distanceKm:null},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({ok:false,code:"DELIVERY_PREFERENCES_UNAVAILABLE"},{status:503});}
}
