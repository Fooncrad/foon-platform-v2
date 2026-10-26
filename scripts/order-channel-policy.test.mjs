import test from "node:test";
import assert from "node:assert/strict";
import {orderChannelStatus} from "../lib/restaurant/order-channel-policy.ts";
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

test("legacy branches with neither hour configured remain open",()=>{
 for(const branch of [{},{openingTime:"",closingTime:""},{openingTime:null,closingTime:null}]){
  assert.equal(orderChannelStatus({},branch,"room_service").allowed,true);
 }
});
test("partially configured hours must not silently allow orders",()=>{
 for(const branch of [{openingTime:"09:00"},{closingTime:"17:00"},{openingTime:"09:00",closingTime:""}]){
  assert.equal(orderChannelStatus({},branch,"delivery").reason,"STORE_CLOSED");
 }
});
test("malformed configured hours fail closed across all channels",()=>{
 for(const branch of [{openingTime:"25:00",closingTime:"17:00"},{openingTime:"09:00",closingTime:"17:99"},{openingTime:900,closingTime:"17:00"}]){
  for(const channel of ["delivery","takeaway","dine_in","room_service"])
   assert.equal(orderChannelStatus({},branch,channel).reason,"STORE_CLOSED");
 }
});
test("invalid timezone blocks otherwise valid hours",()=>{
 assert.equal(orderChannelStatus({},{openingTime:"09:00",closingTime:"17:00",timeZone:"Bad/Zone"},"delivery").reason,"INVALID_BRANCH_TIMEZONE");
});
