import test from "node:test";
import assert from "node:assert/strict";
import {insertPricedEdgeOrder} from "../lib/platform/edge-sync-create-order.mjs";
const orderId="11111111-1111-4111-8111-111111111111";
const itemId="22222222-2222-4222-8222-222222222222";
const actorUserId="33333333-3333-4333-8333-333333333333";
const event={kind:"created",orderId,tenantId:"tenant-1",branchId:"branch-1",payload:{id:orderId,branchId:"branch-1",status:"new",createdAt:"2026-10-11T12:00:00.000Z",items:[{id:itemId,quantity:2}]}};
const context={source:"trusted_server_policy",actorUserId,taxPolicyResolved:true,discountPolicyResolved:true,optionsPolicyResolved:true,taxCents:0,discountCents:0,channel:"takeaway"};
function fake(){
 const writes=[];
 const connection={async execute(sql,params){
  if(sql.startsWith("SELECT u.id"))return [[{id:actorUserId}]];
  if(sql.startsWith("SELECT id FROM branches"))return [[{id:"branch-1"}]];
  if(sql.startsWith("SELECT mi.id"))return [[{id:itemId,name:"Coffee",price:"9.95",currency:"SAR"}]];
  if(sql.startsWith("SELECT data FROM restaurant_resources"))return [[]];
  writes.push({sql,params});return [{affectedRows:1}];
 }};
 return {writes,connection};
}
test("writes order and items using authoritative prices",async()=>{
 const {connection,writes}=fake();
 const result=await insertPricedEdgeOrder(connection,event,context);
 assert.equal(result.total,"19.90");
 assert.equal(writes.length,2);
 assert.match(writes[0].sql,/INSERT INTO restaurant_orders/);
 assert.equal(writes[0].params[6],"19.90");
 assert.match(writes[1].sql,/INSERT INTO restaurant_order_items/);
 assert.equal(writes[1].params[7],"19.90");
});
test("unresolved policies block database writes",async()=>{
 const {connection,writes}=fake();
 await assert.rejects(()=>insertPricedEdgeOrder(connection,event,{...context,taxPolicyResolved:false}),/EDGE_ORDER_POLICY_UNRESOLVED/);
 await assert.rejects(()=>insertPricedEdgeOrder(connection,event,{...context,taxCents:50}),/EDGE_NONZERO_ADJUSTMENTS_NOT_IMPLEMENTED/);
 assert.equal(writes.length,0);
});
test("unsupported dine-in and delivery cannot create orders",async()=>{
 const {connection,writes}=fake();
 for(const channel of ["dine_in","delivery"]){
  await assert.rejects(()=>insertPricedEdgeOrder(connection,event,{...context,channel}),/EDGE_ORDER_CHANNEL_NOT_READY/);
 }
 assert.equal(writes.length,0);
});
test("untrusted actor identity is rejected",async()=>{
 const {connection,writes}=fake();
 await assert.rejects(()=>insertPricedEdgeOrder(connection,event,{...context,actorUserId:"bad"}),/EDGE_AUTHENTICATED_ACTOR_REQUIRED/);
 assert.equal(writes.length,0);
});

test("rejects unimplemented payment, coupon and item option fields",async()=>{
 const {connection,writes}=fake();
 for(const field of ["payment_status","coupon_id","total","customer_phone"]){
  await assert.rejects(()=>insertPricedEdgeOrder(connection,{...event,payload:{...event.payload,[field]:"untrusted"}},context),/EDGE_UNSUPPORTED_ORDER_FIELDS/);
 }
 await assert.rejects(()=>insertPricedEdgeOrder(connection,{...event,payload:{...event.payload,items:[{id:itemId,quantity:2,options:[{id:"extra"}]}]}},context),/EDGE_UNSUPPORTED_ITEM_FIELDS/);
 assert.equal(writes.length,0);
});

test("caller must explicitly supply trusted server policy context",async()=>{
 const {connection,writes}=fake();
 await assert.rejects(()=>insertPricedEdgeOrder(connection,event,{...context,source:"device"}),/EDGE_ORDER_POLICY_UNRESOLVED/);
 await assert.rejects(()=>insertPricedEdgeOrder(connection,event,{...context,source:undefined}),/EDGE_ORDER_POLICY_UNRESOLVED/);
 assert.equal(writes.length,0);
});

test("rejects forged local branch or status metadata",async()=>{
 const {connection,writes}=fake();
 for(const patch of [{branchId:"branch-other"},{status:"completed"},{createdAt:"invalid"}]){
  await assert.rejects(()=>insertPricedEdgeOrder(connection,{...event,payload:{...event.payload,...patch}},context),/EDGE_INVALID_LOCAL_ORDER_METADATA/);
 }
 assert.equal(writes.length,0);
});

test("rejects primitive and array cart entries before any SQL",async()=>{
 const {connection,writes}=fake();
 for(const invalid of ["bad",42,[],null]){
  await assert.rejects(()=>insertPricedEdgeOrder(connection,{...event,payload:{...event.payload,items:[invalid]}},context),/EDGE_UNSUPPORTED_ITEM_FIELDS/);
 }
 assert.equal(writes.length,0);
});

test("configured tax or fees block legacy edge creation without an untaxed write",async()=>{
 for(const data of [{vatEnabled:"yes",vatRate:15},{checkoutServiceFee:5},{checkoutDeliveryFee:10}]){
  const {connection,writes}=fake(),execute=connection.execute.bind(connection);connection.execute=async(sql,params)=>sql.startsWith("SELECT data FROM restaurant_resources")?[[{data}]]:execute(sql,params);
  await assert.rejects(()=>insertPricedEdgeOrder(connection,event,context),/EDGE_CHARGES_NOT_SUPPORTED/);assert.equal(writes.length,0);
 }
});
