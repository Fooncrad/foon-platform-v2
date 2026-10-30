import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {openActivityStore} from "./foon-edge-activity-store.mjs";

const scope={tenantId:"tenant-1",branchId:"branch-1",deviceId:"device-1"};
const event=(overrides={})=>({activity:"grocery",entityType:"product",entityId:"sku-100",operation:"upsert",expectedVersion:0,idempotencyKey:"device-1:1",payload:{name:"Rice",quantity:20},...overrides});
const verified=(row,receipt)=>receipt.eventId===row.event_id&&receipt.digest===row.payload_digest;

test("activity journal commits entity and outbox atomically, is idempotent and branch scoped",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"foon-activity-store-")),file=join(dir,"offline.sqlite");
 let store;
 try{
  store=openActivityStore(file,{verifyReceipt:verified});
  const created=store.append(scope,event());
  assert.equal(created.version,1);assert.equal(created.duplicate,false);
  assert.equal(store.append(scope,event()).duplicate,true);
  assert.throws(()=>store.append(scope,event({payload:{name:"Tampered"},expectedVersion:1})),/IDEMPOTENCY_KEY_REUSED/);
  assert.throws(()=>store.append(scope,event({idempotencyKey:"device-1:2",expectedVersion:0})),/ACTIVITY_VERSION_CONFLICT/);
  assert.deepEqual(store.read(scope,{activity:"grocery"}).map(x=>({id:x.entityId,version:x.version,payload:x.payload})),[{id:"sku-100",version:1,payload:{name:"Rice",quantity:20}}]);
  assert.equal(store.read({...scope,branchId:"branch-2"}).length,0);
  assert.equal(store.pending({...scope,tenantId:"tenant-2"}).length,0);
  assert.equal(store.pending(scope).length,1);
  store.markRetry(created.seq,"network offline");
  assert.equal(store.pending(scope)[0].attempts,1);
  assert.throws(()=>store.acknowledge(created.seq,{receiptId:"receipt-invalid"}),/INVALID_CLOUD_RECEIPT/);
  const raw=store.pending(scope)[0];
  const receipt={receiptId:"receipt-0001",eventId:raw.eventId,digest:raw.digest};
  assert.equal(store.acknowledge(created.seq,receipt).synced,true);
  assert.equal(store.acknowledge(created.seq,receipt).duplicate,true);
  assert.equal(store.pending(scope).length,0);
  assert.throws(()=>store.append(scope,event({idempotencyKey:"device-1:3",expectedVersion:0})),/ACTIVITY_VERSION_CONFLICT/);
  const removed=store.append(scope,event({operation:"delete",expectedVersion:1,idempotencyKey:"device-1:2",payload:{reason:"removed"}}));
  assert.equal(removed.version,2);
  assert.equal(store.read(scope)[0].deleted,true);
  store.close();store=null;
  store=openActivityStore(file,{verifyReceipt:verified});
  assert.equal(store.read(scope)[0].version,2);
  assert.equal(store.pending(scope).length,1);
 }finally{store?.close();await rm(dir,{recursive:true,force:true});}
});

test("journal rejects invalid activity, malformed scope and unsafe limits",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"foon-activity-validation-"));
 const store=openActivityStore(join(dir,"offline.sqlite"),{verifyReceipt:()=>true});
 try{
  assert.throws(()=>store.append({...scope,branchId:"" },event()),/INVALID_AUTHENTICATED_SCOPE/);
  assert.throws(()=>store.append(scope,event({activity:"unknown"})),/INVALID_ACTIVITY_EVENT/);
  assert.throws(()=>store.pending(scope,501),/INVALID_LIMIT/);
  assert.throws(()=>store.read(scope,{activity:"unknown"}),/INVALID_ACTIVITY/);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});

test("journal accepts and isolates every supported FOON activity",async()=>{
 const activities=["restaurant","cafe","grocery","fashion","perfume_beauty","accessories_watches","gifts_packaging","ecommerce","car_wash","laundry","vehicle_services","salon_beauty","contracting","general_services"];
 const dir=await mkdtemp(join(tmpdir(),"foon-activity-matrix-"));
 const store=openActivityStore(join(dir,"offline.sqlite"),{verifyReceipt:verified});
 try{
  for(const [index,activity] of activities.entries()){
   const result=store.append(scope,event({activity,entityType:"record",entityId:"record-"+index,idempotencyKey:"device-1:activity:"+index,payload:{activity,index}}));
   assert.equal(result.version,1,activity);
  }
  const rows=store.read(scope);
  assert.equal(rows.length,activities.length);
  assert.deepEqual(new Set(rows.map(row=>row.activity)),new Set(activities));
  assert.equal(store.pending(scope,500).length,activities.length);
  assert.equal(store.read({...scope,tenantId:"tenant-other"}).length,0);
  assert.equal(store.read({...scope,branchId:"branch-other"}).length,0);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});

test("journal refuses a receipt for a different event or payload digest",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"foon-activity-receipt-"));
 const store=openActivityStore(join(dir,"offline.sqlite"),{verifyReceipt:verified});
 try{
  const created=store.append(scope,event());
  const pending=store.pending(scope)[0];
  assert.throws(()=>store.acknowledge(created.seq,{receiptId:"receipt-0001",eventId:"another-event",digest:pending.digest}),/INVALID_CLOUD_RECEIPT/);
  assert.throws(()=>store.acknowledge(created.seq,{receiptId:"receipt-0001",eventId:pending.eventId,digest:"0".repeat(64)}),/INVALID_CLOUD_RECEIPT/);
  assert.equal(store.pending(scope).length,1);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
