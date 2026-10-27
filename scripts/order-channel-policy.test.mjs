import test from "node:test";
import assert from "node:assert/strict";
import {orderChannelStatus,validOrderChannel} from "../lib/restaurant/order-channel-policy.ts";
const at=value=>new Date(value);
test("all activities share a global ordering kill switch",()=>{
 for(const channel of ["delivery","takeaway","dine_in","room_service"])
  assert.equal(orderChannelStatus({ordersEnabled:"no"},{},channel).reason,"ORDERS_DISABLED");
});
test("merchant and branch channel switches are independent",()=>{
 assert.equal(orderChannelStatus({deliveryEnabled:"no"},{},"delivery").allowed,false);
 assert.equal(orderChannelStatus({deliveryEnabled:"no"},{},"takeaway").allowed,true);
 assert.equal(orderChannelStatus({},{pickupEnabled:"no"},"takeaway").allowed,false);
 assert.equal(orderChannelStatus({},{dineInEnabled:"no"},"dine_in").allowed,false);
 assert.equal(orderChannelStatus({roomServiceEnabled:"no"}, {}, "room_service").allowed,false);
 assert.equal(orderChannelStatus({}, {roomServiceEnabled:"no"}, "room_service").allowed,false);
 assert.equal(orderChannelStatus({}, {}, "room_service").allowed,true);
});
test("configured hours block orders at closing time",()=>{
 const branch={openingTime:"09:00",closingTime:"17:00",timeZone:"UTC"};
 assert.equal(orderChannelStatus({},branch,"delivery",at("2026-10-18T12:00:00Z")).allowed,true);
 assert.equal(orderChannelStatus({},branch,"delivery",at("2026-10-18T17:00:00Z")).reason,"STORE_CLOSED");
});
test("overnight hours and closed-all-day schedules",()=>{
 const branch={openingTime:"20:00",closingTime:"04:00",timeZone:"UTC"};
 assert.equal(orderChannelStatus({},branch,"takeaway",at("2026-10-18T23:00:00Z")).allowed,true);
 assert.equal(orderChannelStatus({},branch,"takeaway",at("2026-10-19T02:00:00Z")).allowed,true);
 assert.equal(orderChannelStatus({},branch,"takeaway",at("2026-10-19T08:00:00Z")).allowed,false);
 assert.equal(orderChannelStatus({},{openingTime:"00:00",closingTime:"00:00"},"delivery").allowed,false);
});
test("partial and malformed business hours fail closed",()=>{
 for(const branch of [{openingTime:"09:00"},{closingTime:"17:00"},{openingTime:"25:00",closingTime:"17:00"},{openingTime:"09:00",closingTime:"17:99"}]){
  for(const channel of ["delivery","takeaway","dine_in","room_service"])
   assert.equal(orderChannelStatus({},branch,channel).reason,"STORE_CLOSED");
 }
});
test("unconfigured legacy hours remain allowed",()=>{
 for(const branch of [{},{openingTime:null,closingTime:null},{openingTime:"",closingTime:""}])
  assert.equal(orderChannelStatus({},branch,"delivery").allowed,true);
});
test("unknown and inherited channel names fail closed before checking business hours",()=>{
 for(const channel of ["deliveri","pickup","constructor","toString","__proto__",""]){
  assert.deepEqual(orderChannelStatus({}, {}, channel),{allowed:false,reason:"ORDER_CHANNEL_DISABLED"},channel);
 }
});
test("coerced JSON channels cannot bypass per-channel settings",()=>{
 for(const channel of [["delivery"],["room_service"],null,undefined,0,{toString:()=>"delivery"}]){
  assert.deepEqual(orderChannelStatus({}, {}, channel),{allowed:false,reason:"ORDER_CHANNEL_DISABLED"});
 }
});
test("all supported channels remain allowed when opening hours are fully unset",()=>{
 for(const channel of ["delivery","takeaway","dine_in","room_service"])
  assert.equal(orderChannelStatus({}, {}, channel).allowed,true);
});
test("checkout input validator accepts only exact primitive order channels",()=>{
 for(const channel of ["delivery","takeaway","dine_in","room_service"])
  assert.equal(validOrderChannel(channel),true,channel);
 for(const channel of [["delivery"],["room_service"],{toString:()=>"delivery"},null,undefined,0,true,"constructor","toString","__proto__","deliveri",""])
  assert.equal(validOrderChannel(channel),false,String(channel));
});
test("createOrder validates raw channel before delivery and hotel business checks",async()=>{
 const {readFileSync}=await import("node:fs");
 const source=readFileSync(new URL("../lib/restaurant/operations.ts",import.meta.url),"utf8");
 const start=source.indexOf("export async function createOrder(");
 const end=source.indexOf("export async function recordManualPaymentAtCreate(",start);
 assert.ok(start>=0&&end>start);
 const create=source.slice(start,end);
 assert.match(create,/!validOrderChannel\(body\.channel\)/);
 assert.doesNotMatch(create,/includes\(String\(body\.channel\)\)/);
 assert.match(create,/if\(body\.channel==="delivery"\)/);
 assert.match(create,/if\(body\.channel==="room_service"\)/);
});
