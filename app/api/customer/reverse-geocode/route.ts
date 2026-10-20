import {NextResponse} from "next/server";
import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {currentUserId} from "@/lib/auth/session";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
import {allowedDeliveryCountries} from "@/lib/tenant/international-shipping";
import {normalizedReverseGeocode} from "@/lib/tenant/reverse-geocode";

export const runtime="nodejs";
const noStore={headers:{"Cache-Control":"no-store"}};
// Best-effort process-level throttle. Apply hard quotas to the provider key as well.
const requests=new Map<string,{since:number;count:number}>();
function limited(user:string){
 const now=Date.now(),last=requests.get(user);
 if(!last||now-last.since>60_000){requests.set(user,{since:now,count:1});return false;}
 if(last.count>=3)return true;
 last.count++;return false;
}
function failure(code:string,status:number){return NextResponse.json({ok:false,code},{status,...noStore});}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return failure("FORBIDDEN",403);}
 const blocked=await employeePersonalAccessDenied();if(blocked)return blocked;
 const user=await currentUserId();if(!user)return failure("UNAUTHENTICATED",401);
 const body=await request.json().catch(()=>null);
 const lat=body?.latitude,lng=body?.longitude;
 if(typeof lat!=="number"||typeof lng!=="number"||!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -90||lat>90||lng< -180||lng>180||typeof body.storeSlug!=="string"||body.storeSlug.length>120||!body.storeSlug.length)return failure("INVALID_INPUT",400);
 if(limited(user))return failure("RATE_LIMITED",429);
 const key=process.env.GOOGLE_MAPS_GEOCODING_API_KEY;
 if(!key)return failure("GEOCODING_NOT_CONFIGURED",503);
 try{
  const [stores]=await database().execute<RowDataPacket[]>("SELECT t.id,p.country_code,p.activity_code FROM tenants t JOIN tenant_business_profiles p ON p.tenant_id=t.id WHERE t.slug=? AND t.status='active' LIMIT 1",[body.storeSlug]);
  if(!stores.length)return failure("STORE_NOT_FOUND",404);
  const allowed=await allowedDeliveryCountries(String(stores[0].id),String(stores[0].country_code??""),String(stores[0].activity_code??""));
  const language=body.language==="fr"?"fr":body.language==="en"?"en":"ar";
  const params=new URLSearchParams({latlng:lat+","+lng,key,language});
  const response=await fetch("https://maps.googleapis.com/maps/api/geocode/json?"+params.toString(),{cache:"no-store",signal:AbortSignal.timeout(8000)});
  if(!response.ok)return failure("GEOCODING_UNAVAILABLE",503);
  const data=await response.json();
  const location=normalizedReverseGeocode(data);
  if(!location)return failure("GEOCODING_UNAVAILABLE",503);
  if(!allowed.includes(location.countryCode))return failure("DELIVERY_COUNTRY_MISMATCH",400);
  return NextResponse.json({ok:true,...location},{...noStore});
 }catch{return failure("GEOCODING_UNAVAILABLE",503);}
}
