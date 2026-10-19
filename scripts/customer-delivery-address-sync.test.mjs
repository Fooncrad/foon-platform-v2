import assert from "node:assert/strict";
import {test} from "node:test";
import {addressFromStoredFields,checkoutAddressFields,saveCheckoutDeliveryAddress} from "../lib/tenant/delivery-address-sync.ts";

test("checkout address normalizes and preserves long address without truncation",()=>{
 const address="شارع أ"+"x".repeat(650);
 const fields=checkoutAddressFields({countryCode:"sa",city:"الرياض",address,phone:"0500000000",latitude:24.7,longitude:46.7});
 assert.equal(fields.countryCode,"SA");
 assert.equal(fields.streetAddress.length,500);
 assert.equal(addressFromStoredFields(fields.streetAddress,fields.deliveryNotes),address);
 assert.equal(fields.latitude,24.7);
});
test("invalid coordinates are dropped without dropping otherwise valid address",()=>{
 const fields=checkoutAddressFields({countryCode:"SA",city:"الرياض",address:"شارع الملك فهد",phone:"0500000000",latitude:500,longitude:46});
 assert.equal(fields.latitude,null);assert.equal(fields.longitude,null);
 assert.equal(checkoutAddressFields({countryCode:"ABC",city:"الرياض",address:"شارع الملك فهد",phone:"0500000000"}),null);
});
test("repeated checkout saves one default address and subsequent addresses are not default",async()=>{
 const rows=[];
 const queries=[];
 const db={async execute(sql,params){
  queries.push([sql,params]);
  if(sql.includes("WHERE user_id=? AND country_code=?"))return [rows.filter(r=>r.user===params[0]&&r.country===params[1]&&r.city===params[2]&&r.street===params[3]&&r.notes===params[4]).map(r=>({id:r.id}))];
  if(sql.startsWith("SELECT id FROM customer_delivery_addresses"))return [rows.filter(r=>r.user===params[0]).map(r=>({id:r.id}))];
  if(sql.startsWith("INSERT INTO customer_delivery_addresses")){rows.push({id:params[0],user:params[1],country:params[4],city:params[5],street:params[6],notes:params[7],default:params[10]});return [{}];}
  if(sql.startsWith("UPDATE customer_delivery_addresses"))return [{}];
  throw new Error(sql);
 }};
 const base={countryCode:"SA",city:"الرياض",address:"شارع العليا",phone:"0500000000"};
 await saveCheckoutDeliveryAddress(db,"customer-1",base);
 await saveCheckoutDeliveryAddress(db,"customer-1",base);
 await saveCheckoutDeliveryAddress(db,"customer-1",{...base,address:"شارع آخر"});
 await saveCheckoutDeliveryAddress(db,"customer-2",base);
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(r=>r.default),[true,false,true]);
 assert.equal(queries.filter(([sql])=>sql.startsWith("INSERT INTO customer_delivery_addresses")).length,3);
});
