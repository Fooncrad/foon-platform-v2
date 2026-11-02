import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";

const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const noStore={headers:{"Cache-Control":"no-store"}};
type Address={label:string;recipientName:string|null;phone:string|null;countryCode:string;city:string;district:string|null;streetAddress:string;building:string|null;apartment:string|null;deliveryNotes:string|null;latitude:number|null;longitude:number|null;isDefault:boolean};
function optionalText(value:unknown,max:number){return typeof value==="string"?value.trim().slice(0,max)||null:null;}
function parseAddress(value:unknown):Address|null{
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const data=value as Record<string,unknown>,label=typeof data.label==="string"?data.label.trim():"المنزل";
 const recipientName=optionalText(data.recipientName,180),phone=optionalText(data.phone,40);
 const countryCode=typeof data.countryCode==="string"?data.countryCode.trim().toUpperCase():"SA";
 const city=typeof data.city==="string"?data.city.trim():"",district=optionalText(data.district,180);
 const streetAddress=typeof data.streetAddress==="string"?data.streetAddress.trim():"";
 const building=optionalText(data.building,100),apartment=optionalText(data.apartment,100),deliveryNotes=optionalText(data.deliveryNotes,1000);
 const hasLatitude=data.latitude!==undefined&&data.latitude!==null&&data.latitude!=="",hasLongitude=data.longitude!==undefined&&data.longitude!==null&&data.longitude!=="";
 const latitude=hasLatitude?Number(data.latitude):null,longitude=hasLongitude?Number(data.longitude):null;
 if(label.length<1||label.length>80||!/^[A-Z]{2}$/.test(countryCode)||city.length<1||city.length>120||streetAddress.length<1||streetAddress.length>500)return null;
 if(phone&&(!/^\+?[\d ()-]{7,40}$/.test(phone)||phone.replace(/\D/g,"").length<7))return null;
 if(hasLatitude!==hasLongitude||hasLatitude&&(!Number.isFinite(latitude)||!Number.isFinite(longitude)||(latitude as number)<-90||(latitude as number)>90||(longitude as number)<-180||(longitude as number)>180))return null;
 if(data.isDefault!==undefined&&typeof data.isDefault!=="boolean")return null;
 return{label,recipientName,phone,countryCode,city,district,streetAddress,building,apartment,deliveryNotes,latitude,longitude,isDefault:data.isDefault===true};
}
function fail(code:string,status:number){return NextResponse.json({ok:false,code},{status,...noStore});}
async function lockUser(db:PoolConnection,userId:string){
 const [rows]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",[userId]);
 return rows.length>0;
}
export async function GET(){
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 const userId=await currentUserId();if(!userId)return fail("UNAUTHENTICATED",401);
 try{
  const [account]=await database().execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status=\'active\' LIMIT 1",[userId]);
  if(!account.length)return fail("UNAUTHENTICATED",401);
  const [addresses]=await database().execute<RowDataPacket[]>("SELECT id,label,recipient_name,phone,country_code,city,district,street_address,building,apartment,delivery_notes,latitude,longitude,is_default,created_at,updated_at FROM customer_delivery_addresses WHERE user_id=? ORDER BY is_default DESC,created_at DESC,id",[userId]);
  return NextResponse.json({ok:true,addresses},{...noStore});
 }catch{return fail("ADDRESSES_UNAVAILABLE",503);}
}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return fail("FORBIDDEN",403);}
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 const userId=await currentUserId();if(!userId)return fail("UNAUTHENTICATED",401);
 const address=parseAddress(await request.json().catch(()=>null));if(!address)return fail("INVALID_INPUT",400);
 const db=await database().getConnection();
 try{
  await db.beginTransaction();if(!await lockUser(db,userId)){await db.rollback();return fail("UNAUTHENTICATED",401);}
  const [rows]=await db.execute<RowDataPacket[]>("SELECT id FROM customer_delivery_addresses WHERE user_id=? FOR UPDATE",[userId]);
  const isDefault=address.isDefault||rows.length===0;
  if(isDefault)await db.execute("UPDATE customer_delivery_addresses SET is_default=FALSE WHERE user_id=?",[userId]);
  const id=randomUUID();
  await db.execute("INSERT INTO customer_delivery_addresses(id,user_id,label,recipient_name,phone,country_code,city,district,street_address,building,apartment,delivery_notes,latitude,longitude,is_default) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,userId,address.label,address.recipientName,address.phone,address.countryCode,address.city,address.district,address.streetAddress,address.building,address.apartment,address.deliveryNotes,address.latitude,address.longitude,isDefault]);
  await db.commit();return NextResponse.json({ok:true,id,isDefault},{status:201,...noStore});
 }catch{await db.rollback();return fail("ADDRESS_SAVE_FAILED",503);}finally{db.release();}
}
export async function PATCH(request:Request){
 try{assertSameOrigin(request);}catch{return fail("FORBIDDEN",403);}
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 const userId=await currentUserId();if(!userId)return fail("UNAUTHENTICATED",401);
 const body=await request.json().catch(()=>null),id=typeof body?.id==="string"?body.id:"",address=parseAddress(body);
 if(!idPattern.test(id)||!address)return fail("INVALID_INPUT",400);
 const db=await database().getConnection();
 try{
  await db.beginTransaction();if(!await lockUser(db,userId)){await db.rollback();return fail("UNAUTHENTICATED",401);}
  const [rows]=await db.execute<RowDataPacket[]>("SELECT is_default FROM customer_delivery_addresses WHERE id=? AND user_id=? FOR UPDATE",[id,userId]);
  if(!rows.length){await db.rollback();return fail("ADDRESS_NOT_FOUND",404);}
  if(address.isDefault)await db.execute("UPDATE customer_delivery_addresses SET is_default=FALSE WHERE user_id=?",[userId]);
  const isDefault=address.isDefault||Boolean(rows[0].is_default);
  await db.execute("UPDATE customer_delivery_addresses SET label=?,recipient_name=?,phone=?,country_code=?,city=?,district=?,street_address=?,building=?,apartment=?,delivery_notes=?,latitude=?,longitude=?,is_default=? WHERE id=? AND user_id=?",[address.label,address.recipientName,address.phone,address.countryCode,address.city,address.district,address.streetAddress,address.building,address.apartment,address.deliveryNotes,address.latitude,address.longitude,isDefault,id,userId]);
  await db.commit();return NextResponse.json({ok:true,id,isDefault},{...noStore});
 }catch{await db.rollback();return fail("ADDRESS_SAVE_FAILED",503);}finally{db.release();}
}
export async function DELETE(request:Request){
 try{assertSameOrigin(request);}catch{return fail("FORBIDDEN",403);}
 const employeeDenied=await employeePersonalAccessDenied();if(employeeDenied)return employeeDenied;
 const userId=await currentUserId();if(!userId)return fail("UNAUTHENTICATED",401);
 const body=await request.json().catch(()=>null),id=typeof body?.id==="string"?body.id:"";
 if(!idPattern.test(id))return fail("INVALID_INPUT",400);
 const db=await database().getConnection();
 try{
  await db.beginTransaction();if(!await lockUser(db,userId)){await db.rollback();return fail("UNAUTHENTICATED",401);}
  const [rows]=await db.execute<RowDataPacket[]>("SELECT is_default FROM customer_delivery_addresses WHERE id=? AND user_id=? FOR UPDATE",[id,userId]);
  if(!rows.length){await db.rollback();return fail("ADDRESS_NOT_FOUND",404);}
  await db.execute("DELETE FROM customer_delivery_addresses WHERE id=? AND user_id=?",[id,userId]);
  if(rows[0].is_default){
   const [next]=await db.execute<RowDataPacket[]>("SELECT id FROM customer_delivery_addresses WHERE user_id=? ORDER BY created_at,id LIMIT 1 FOR UPDATE",[userId]);
   if(next.length)await db.execute("UPDATE customer_delivery_addresses SET is_default=TRUE WHERE id=? AND user_id=?",[next[0].id,userId]);
  }
  await db.commit();return NextResponse.json({ok:true},{...noStore});
 }catch{await db.rollback();return fail("ADDRESS_DELETE_FAILED",503);}finally{db.release();}
}