import {randomUUID} from "node:crypto";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";

// Keep the original checkout address intact even when it exceeds the address
// book's 500-character street field. Continuations live in delivery_notes.
const CONTINUATION="FOON_ADDRESS_CONTINUATION:";
export type CheckoutAddressInput={
 countryCode:unknown;city:unknown;address:unknown;phone:unknown;
 latitude?:unknown;longitude?:unknown;
};
function coords(latitude:unknown,longitude:unknown):{latitude:number|null;longitude:number|null}{
 const lat=latitude==null||latitude===""?null:Number(latitude);
 const lng=longitude==null||longitude===""?null:Number(longitude);
 if(lat===null||lng===null||!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -90||lat>90||lng< -180||lng>180)return {latitude:null,longitude:null};
 return {latitude:lat,longitude:lng};
}
export function checkoutAddressFields(input:CheckoutAddressInput){
 const countryCode=typeof input.countryCode==="string"?input.countryCode.trim().toUpperCase():"";
 const city=typeof input.city==="string"?input.city.trim():"";
 const address=typeof input.address==="string"?input.address.trim():"";
 const phone=typeof input.phone==="string"?input.phone.trim():"";
 if(!/^[A-Z]{2}$/.test(countryCode)||city.length<2||city.length>120||address.length<5||address.length>900||phone.length>40)return null;
 const location=coords(input.latitude,input.longitude);
 return {countryCode,city,streetAddress:address.slice(0,500),deliveryNotes:address.length>500?CONTINUATION+address.slice(500):null,phone:phone||null,...location};
}
export function addressFromStoredFields(street:unknown,notes:unknown):string{
 const address=typeof street==="string"?street:"";
 return address+(typeof notes==="string"&&notes.startsWith(CONTINUATION)?notes.slice(CONTINUATION.length):"");
}
// Called inside the order transaction, after acquiring the customer row lock.
// Repeat checkout requests reuse the same address rather than creating duplicates.
export async function saveCheckoutDeliveryAddress(db:Pick<PoolConnection,"execute">,userId:string,input:CheckoutAddressInput):Promise<void>{
 const a=checkoutAddressFields(input);
 if(!a)return;
 const [existing]=await db.execute<RowDataPacket[]>(
  "SELECT id FROM customer_delivery_addresses WHERE user_id=? AND country_code=? AND city=? AND street_address=? AND delivery_notes <=> ? LIMIT 1",
  [userId,a.countryCode,a.city,a.streetAddress,a.deliveryNotes]);
 if(existing.length){
  await db.execute("UPDATE customer_delivery_addresses SET phone=?,latitude=COALESCE(?,latitude),longitude=COALESCE(?,longitude) WHERE id=? AND user_id=?",
   [a.phone,a.latitude,a.longitude,existing[0].id,userId]);
  return;
 }
 const [first]=await db.execute<RowDataPacket[]>("SELECT id FROM customer_delivery_addresses WHERE user_id=? LIMIT 1",[userId]);
 await db.execute(
  "INSERT INTO customer_delivery_addresses(id,user_id,label,phone,country_code,city,street_address,delivery_notes,latitude,longitude,is_default) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  [randomUUID(),userId,"عنوان التوصيل",a.phone,a.countryCode,a.city,a.streetAddress,a.deliveryNotes,a.latitude,a.longitude,first.length===0]);
}
