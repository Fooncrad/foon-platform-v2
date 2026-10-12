import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {localConsoleFixture} from "./foon-edge-console-fixture.mjs";
import {signCloudReceipt} from "../lib/platform/edge-sync-receipt-signature.mjs";
import {eventDigest} from "./foon-edge-sync-contract.mjs";
test("local POS/KDS protects sessions, roles, device queues and cloud reconciliation",async()=>{
 const fixture=await localConsoleFixture();
 const call=async(path,method="GET",body,session,origin=fixture.origin)=>fetch(fixture.origin+path,{method,headers:{origin,"content-type":"application/json",...(session?{cookie:session.cookie,"x-foon-csrf":session.csrf}:{})},body:body?JSON.stringify(body):undefined});
 async function login(username){const r=await call("/api/login","POST",{username,password:fixture.password});assert.equal(r.status,200);const body=await r.json();assert.ok(r.headers.get("set-cookie").includes("HttpOnly"));return {cookie:r.headers.get("set-cookie").split(";")[0],csrf:body.csrf};}
 try{
  assert.equal((await call("/api/state")).status,401);
  const cashier=await login("cashier"),kitchen=await login("kitchen"),id=randomUUID();
  const cart={id,items:[{id:fixture.itemId,quantity:2}]};
  assert.equal((await call("/api/orders","POST",cart,cashier,"https://evil.example")).status,403);
  assert.equal((await call("/api/orders","POST",cart,kitchen)).status,403);
  assert.equal((await call("/api/orders","POST",cart,cashier)).status,201);
  assert.equal((await call("/api/orders","POST",cart,cashier)).status,200);
  assert.equal((await call("/api/orders/"+id+"/status","PATCH",{status:"cancelled"},kitchen)).status,403);
  assert.equal((await call("/api/orders/"+id+"/status","PATCH",{status:"preparing"},kitchen)).status,200);
  const state=await (await call("/api/state","GET",undefined,cashier)).json();assert.equal(state.orders.length,1);assert.equal(state.pending,2);assert.ok(!JSON.stringify(state).includes(fixture.gatewayToken));
  const queued=[];
  for(const user of fixture.users){const batch=await (await fixture.gateway("/outbox?deviceId="+user.deviceId)).json();assert.equal(batch.events.length,1);queued.push([user,batch.events[0]]);}
  const firstEvent=queued[0][1];
  assert.equal((await fixture.gateway("/outbox/conflict","POST",{seq:firstEvent.seq,orderId:id,code:"EDGE_CATALOG_PRICE_CHANGED"})).status,200);
  assert.equal((await (await call("/api/state","GET",undefined,cashier)).json()).orders[0].error,"EDGE_CATALOG_PRICE_CHANGED");
  assert.equal((await (await call("/api/state","GET",undefined,cashier)).json()).orders[0].canRetry,true);
  assert.equal((await (await call("/api/state","GET",undefined,kitchen)).json()).orders[0].canRetry,false);
  assert.equal((await call("/api/orders/"+id+"/retry","POST",{},kitchen)).status,200);
  assert.equal((await (await fixture.gateway("/outbox?deviceId="+fixture.users[0].deviceId)).json()).events[0].sync_error,"EDGE_CATALOG_PRICE_CHANGED");
  assert.equal((await call("/api/orders/"+id+"/retry","POST",{},cashier)).status,200);
  assert.equal((await (await fixture.gateway("/outbox?deviceId="+fixture.users[0].deviceId)).json()).events[0].sync_error,null);
  const order={id,branch_id:fixture.branchId,status:"ready",version:2,channel:"dine_in",location:"الصالة · طاولة 7",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),items:[{id:fixture.itemId,name:"قهوة",quantity:2,options:["حليب إضافي"]}]};
  const snapshot={tenantId:fixture.tenantId,branchId:fixture.branchId,orders:[order]};
  assert.equal((await fixture.gateway("/cloud/state","POST",snapshot)).status,200);
  assert.equal((await (await call("/api/state","GET",undefined,cashier)).json()).orders[0].status,"preparing");
  for(const [user,event] of queued){
   const receipt=signCloudReceipt({receiptId:randomUUID(),deviceId:user.deviceId,eventSeq:event.event_seq,orderId:id,digest:eventDigest({seq:event.event_seq,order_id:id,kind:event.kind,payload:event.payload})},user.signingSecret);
   const wrong=signCloudReceipt({...receipt,deviceId:fixture.users.find(other=>other!==user).deviceId},fixture.users.find(other=>other!==user).signingSecret);
   assert.equal((await fixture.gateway("/outbox/ack","POST",{seq:event.seq,orderId:id,receipt:wrong})).status,403);
   assert.equal((await fixture.gateway("/outbox/ack","POST",{seq:event.seq,orderId:id,receipt})).status,200);
  }
  assert.equal((await fixture.gateway("/cloud/state","POST",snapshot)).status,200);
  assert.equal((await (await call("/api/state","GET",undefined,cashier)).json()).orders[0].status,"ready");
  const prepared=(await (await call("/api/state","GET",undefined,kitchen)).json()).orders[0];assert.equal(prepared.location,"الصالة · طاولة 7");assert.deepEqual(prepared.items[0].options,["حليب إضافي"]);
  assert.equal((await call("/api/orders","POST",cart,cashier)).status,200);
  assert.equal((await fixture.gateway("/cloud/state","POST",{...snapshot,orders:[{...order,status:"new",version:1}]})).status,200);
  assert.equal((await (await call("/api/state","GET",undefined,cashier)).json()).orders[0].status,"ready");
  assert.equal((await call("/api/logout","POST",{},cashier)).status,200);
  assert.equal((await call("/api/state","GET",undefined,cashier)).status,401);
 }finally{await fixture.close();}
});
