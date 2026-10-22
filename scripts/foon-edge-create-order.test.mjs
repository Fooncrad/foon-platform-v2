import test from "node:test";
import assert from "node:assert/strict";
import {insertPricedEdgeOrder} from "../lib/platform/edge-sync-create-order.mjs";
import {checkoutPolicy,checkoutTotals} from "../lib/restaurant/checkout-pricing.ts";
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
  if(sql.startsWith("SELECT t.name,r.data FROM tenants"))return [[{name:"Demo Cafe",data:null}]];
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

test("a changed full checkout total cannot silently replace the desktop snapshot",async()=>{
 const {connection,writes}=fake();
 await assert.rejects(()=>insertPricedEdgeOrder(connection,{...event,payload:{...event.payload,expectedTotalCents:1980}},context),/EDGE_CHECKOUT_TOTAL_CHANGED/);
 assert.equal(writes.length,0);
 assert.equal((await insertPricedEdgeOrder(connection,{...event,payload:{...event.payload,expectedTotalCents:1990}},context)).total,"19.90");
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

function withSettings(data){
 const {connection,writes}=fake(),execute=connection.execute.bind(connection);
 connection.execute=async(sql,params)=>sql.startsWith("SELECT t.name,r.data FROM tenants")?[[{name:"Demo Cafe",data:JSON.stringify(data)}]]:execute(sql,params);
 return {connection,writes};
}
test("applies configured VAT and fees with the online POS checkout policy",async()=>{
 for(const [data,total,tax] of [[{vatEnabled:"yes",vatRate:15},"22.89","2.99"],[{vatEnabled:"yes",vatRate:15,menuStoredPricesIncludeVat:"yes"},"19.90","2.60"],[{checkoutServiceFee:5},"24.90","0.00"],[{vatEnabled:"yes",vatRate:15,checkoutServiceFee:5,checkoutFeesTaxable:"yes",checkoutFeesIncludeVat:"no"},"28.64","3.74"],[{checkoutDeliveryFee:10},"19.90","0.00"]]){
  const {connection,writes}=withSettings({...data,legalName:"Demo LLC",taxNumber:"300000000000003"});
  const result=await insertPricedEdgeOrder(connection,event,context);
  assert.deepEqual([result.total,result.tax],[total,tax]);
  const [order]=writes;
  assert.equal(order.params[5],"19.90");
  assert.equal(order.params[6],total);
  const snapshot=JSON.parse(order.params[8]);
  assert.deepEqual(snapshot,{version:1,policy:checkoutPolicy(data),seller:{name:"Demo LLC",taxNumber:"300000000000003",address:"",phone:""},...checkoutTotals(19.9,0,"takeaway",checkoutPolicy(data))});
 }
});
test("unconfigured store keeps the untaxed total and records the seller snapshot",async()=>{
 const {connection,writes}=fake();
 await insertPricedEdgeOrder(connection,event,context);
 const snapshot=JSON.parse(writes[0].params[8]);
 assert.equal(snapshot.seller.name,"Demo Cafe");
 assert.equal(snapshot.tax,0);
 assert.equal(snapshot.total,19.9);
});
test("invalid checkout settings block edge creation without an incorrectly taxed write",async()=>{
 for(const data of [{vatEnabled:"yes",vatRate:"15"},{vatEnabled:"yes",vatRate:150},{checkoutServiceFee:-1},{checkoutServiceFee:1.005}]){
  const {connection,writes}=withSettings(data);
  await assert.rejects(()=>insertPricedEdgeOrder(connection,event,context),/EDGE_INVALID_CHECKOUT_SETTINGS/);assert.equal(writes.length,0);
 }
});

test("malformed merchant checkout settings reject as a permanent policy conflict without writes",async()=>{
 for(const raw of ["{broken","null","[]","17","\"just a string\""]){
  const {connection,writes}=fake(),original=connection.execute.bind(connection);
  connection.execute=async(sql,params)=>sql.startsWith("SELECT t.name,r.data FROM tenants")?[[{name:"Demo Cafe",data:raw}]]:original(sql,params);
  await assert.rejects(()=>insertPricedEdgeOrder(connection,event,context),/EDGE_INVALID_CHECKOUT_SETTINGS/);
  assert.equal(writes.length,0);
 }
});
