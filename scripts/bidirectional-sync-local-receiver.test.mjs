import test from "node:test";
import assert from "node:assert/strict";
import {applyVerifiedPullBatch} from "../lib/platform/bidirectional-sync-local-receiver.mjs";
import {pullBatchSignatureMessage} from "../lib/platform/bidirectional-sync-signature.mjs";
import {generateKeyPairSync,sign} from "node:crypto";
import {digestChange} from "../lib/platform/bidirectional-sync-contract.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"];
const scope={deviceId:ids[0],tenantId:ids[1],branchId:ids[2],after:4,limit:10};
const remoteDeviceId="44444444-4444-4444-8444-444444444444";
const event=(id)=>{const c={eventId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[0],entityId:ids[0],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"Coffee"}};return {id,event_id:c.eventId,tenant_id:c.tenantId,branch_id:c.branchId,actor_id:c.actorId,source_device_id:remoteDeviceId,entity_type:c.entityType,entity_id:c.entityId,operation:c.operation,base_version:c.baseVersion,next_version:1,event_timestamp:c.timestamp,payload_json:c.payload,payload_digest:digestChange(c)};};
const batch={ok:true,tenantId:ids[1],branchId:ids[2],events:[event(5)],nextCursor:5};
const pair=generateKeyPairSync("ed25519");
const publicKey=pair.publicKey.export({type:"spki",format:"pem"});
const signed=(b=batch,sc=scope)=>({signature:sign(null,pullBatchSignatureMessage(b,sc),pair.privateKey).toString("base64url"),publicKey});
function fixture({cursor=4,updateCount=1,echoRecord=true,echoDigest=null,echoRowOverrides=null}={}){
 const calls=[];
 const db={calls,async beginTransaction(){calls.push("begin");},
 async commit(){calls.push("commit");},
 async rollback(){calls.push("rollback");},
 async execute(sql,args){
  calls.push(sql);
  if(sql.startsWith("SELECT last_pulled_id"))return [[{last_pulled_id:cursor}]];
  if(sql.startsWith("SELECT tenant_id,branch_id,payload_digest,event_payload FROM foon_sync_pending_events")){
   const e=event(5);
   const local={eventId:e.event_id,tenantId:e.tenant_id,branchId:e.branch_id,actorId:e.actor_id,entityType:e.entity_type,entityId:e.entity_id,operation:e.operation,baseVersion:e.base_version,timestamp:e.event_timestamp,payload:e.payload_json};
   return [echoRecord?[{tenant_id:scope.tenantId,branch_id:scope.branchId,payload_digest:echoDigest??e.payload_digest,event_payload:JSON.stringify(local),...(echoRowOverrides??{})}]:[]];
  }
  if(sql.startsWith("UPDATE foon_sync_device_cursors"))return [{affectedRows:updateCount}];
  throw Error("UNEXPECTED_SQL");
 }};
 return db;
}
test("verified batch applies events and cursor in one transaction",async()=>{
 const db=fixture();let count=0;
 const r=await applyVerifiedPullBatch({db,...signed(),batch,scope,applyEvent:async()=>{count++;return true;}});
 assert.deepEqual(r,{status:"applied",nextCursor:5,count:1});
 assert.equal(count,1);assert.equal(db.calls.at(-1),"commit");assert.equal(db.calls.filter(x=>x==="rollback").length,0);
});
test("signed echo of this device's already-committed event advances cursor without applying twice",async()=>{
 const own={...batch,events:[{...event(5),source_device_id:scope.deviceId}]};
 const db=fixture();let writes=0;
 const result=await applyVerifiedPullBatch({db,batch:own,scope,...signed(own),applyEvent:async()=>{writes++;return true;}});
 assert.deepEqual(result,{status:"applied",nextCursor:5,count:0});
 assert.equal(writes,0);
 assert.equal(db.calls.filter(x=>x.startsWith("UPDATE foon_sync_device_cursors")).length,1);
 assert.equal(db.calls.at(-1),"commit");
});
test("signed self echo without durable local write cannot silently advance cursor",async()=>{
 const own={...batch,events:[{...event(5),source_device_id:scope.deviceId}]};
 const db=fixture({echoRecord:false});let writes=0;
 await assert.rejects(()=>applyVerifiedPullBatch({db,batch:own,scope,...signed(own),applyEvent:async()=>{writes++;return true;}}),/SYNC_LOCAL_ECHO_UNPROVEN/);
 assert.equal(writes,0);assert.equal(db.calls.at(-1),"rollback");
 assert.ok(!db.calls.some(x=>x.startsWith("UPDATE foon_sync_device_cursors")));
});
test("signed self echo with mismatched durable digest cannot advance cursor",async()=>{
 const own={...batch,events:[{...event(5),source_device_id:scope.deviceId}]};
 const db=fixture({echoDigest:"f".repeat(64)});
 await assert.rejects(()=>applyVerifiedPullBatch({db,batch:own,scope,...signed(own),applyEvent:async()=>true}),/SYNC_LOCAL_ECHO_UNPROVEN/);
 assert.equal(db.calls.at(-1),"rollback");
});
test("rejected server identity never opens a transaction",async()=>{
 const db=fixture();
 await assert.rejects(()=>applyVerifiedPullBatch({db,signature:"bad",publicKey,batch,scope,applyEvent:async()=>true}),/SYNC_SIGNATURE_REQUIRED/);
 assert.deepEqual(db.calls,[]);
});
test("failed local entity write rolls back cursor and all changes",async()=>{
 const db=fixture();
 await assert.rejects(()=>applyVerifiedPullBatch({db,...signed(),batch,scope,applyEvent:async()=>false}),/SYNC_LOCAL_APPLY_UNCONFIRMED/);
 assert.equal(db.calls.at(-1),"rollback");assert.ok(!db.calls.includes("commit"));
});
test("stale cursor rejects replay before invoking any adapter",async()=>{
 const db=fixture({cursor:5});let writes=0;
 await assert.rejects(()=>applyVerifiedPullBatch({db,...signed(),batch,scope,applyEvent:async()=>{writes++;return true;}}),/SYNC_CURSOR_CONFLICT/);
 assert.equal(writes,0);assert.equal(db.calls.at(-1),"rollback");
});
test("lost cursor update aborts whole transaction",async()=>{
 const db=fixture({updateCount:0});
 await assert.rejects(()=>applyVerifiedPullBatch({db,...signed(),batch,scope,applyEvent:async()=>true}),/SYNC_CURSOR_WRITE_CONFLICT/);
 assert.equal(db.calls.at(-1),"rollback");assert.ok(!db.calls.includes("commit"));
});
test("invalid cross-branch event fails before opening transaction",async()=>{
 const db=fixture();
 await assert.rejects(()=>applyVerifiedPullBatch({db,...signed(),batch:{...batch,events:[{...event(5),branch_id:ids[0]}]},scope,applyEvent:async()=>true}),/SYNC_BATCH_SCOPE_MISMATCH/);
 assert.deepEqual(db.calls,[]);
});

test("tampered signed batch fails before the database transaction",async()=>{
 const db=fixture();
 const modified={...batch,nextCursor:6};
 await assert.rejects(()=>applyVerifiedPullBatch({db,batch:modified,scope,...signed(),applyEvent:async()=>true}),/SYNC_SIGNATURE_INVALID/);
 assert.deepEqual(db.calls,[]);
});

test("empty signed pull with unchanged cursor commits without a pointless UPDATE",async()=>{
 const empty={...batch,events:[],nextCursor:scope.after};
 const db=fixture();
 const result=await applyVerifiedPullBatch({db,batch:empty,scope,...signed(empty),applyEvent:async()=>{throw Error("no events expected");}});
 assert.deepEqual(result,{status:"applied",nextCursor:scope.after,count:0});
 assert.ok(!db.calls.some(x=>x.startsWith("UPDATE foon_sync_device_cursors")));
 assert.equal(db.calls.at(-1),"commit");
});

test("even correctly signed corrupted digest cannot enter local transaction",async()=>{
 const db=fixture();
 const corrupt={...batch,events:[{...event(5),payload_digest:"b".repeat(64)}]};
 await assert.rejects(()=>applyVerifiedPullBatch({db,batch:corrupt,scope,...signed(corrupt),applyEvent:async()=>true}),/SYNC_CORRUPT_REMOTE_EVENT/);
 assert.deepEqual(db.calls,[]);
});

test("signed event cannot skip an entity version",async()=>{
 const db=fixture();
 const invalid={...batch,events:[{...event(5),next_version:8}]};
 await assert.rejects(()=>applyVerifiedPullBatch({db,batch:invalid,scope,...signed(invalid),applyEvent:async()=>true}),/SYNC_CORRUPT_REMOTE_VERSION/);
 assert.deepEqual(db.calls,[]);
});

test("signed inventory movement must be unique and start at version one",async()=>{
 const db=fixture();
 const original=event(5);
 const inventory={...original,entity_type:"inventory_movement",operation:"movement",payload_json:{itemId:ids[0],delta:-1},base_version:0,next_version:2};
 const envelope={eventId:inventory.event_id,tenantId:inventory.tenant_id,branchId:inventory.branch_id,actorId:inventory.actor_id,entityType:inventory.entity_type,entityId:inventory.entity_id,operation:inventory.operation,baseVersion:inventory.base_version,timestamp:inventory.event_timestamp,payload:inventory.payload_json};
 inventory.payload_digest=digestChange(envelope);
 const malicious={...batch,events:[inventory]};
 await assert.rejects(()=>applyVerifiedPullBatch({db,batch:malicious,scope,...signed(malicious),applyEvent:async()=>true}),/SYNC_CORRUPT_REMOTE_VERSION/);
 assert.deepEqual(db.calls,[]);
});

test("adapter exception during remote order application rolls back without advancing cursor",async()=>{
 const db=fixture();let calls=0;
 await assert.rejects(()=>applyVerifiedPullBatch({db,...signed(),batch,scope,applyEvent:async()=>{calls++;throw Error("SIMULATED_DISK_FAILURE");}}),/SIMULATED_DISK_FAILURE/);
 assert.equal(calls,1);
 assert.equal(db.calls.at(-1),"rollback");
 assert.ok(!db.calls.includes("commit"));
 assert.ok(!db.calls.some(x=>x.startsWith("UPDATE foon_sync_device_cursors")));
});

test("self echo with uppercase source UUID cannot double-apply a locally committed change",async()=>{
 const own={...batch,events:[{...event(5),source_device_id:scope.deviceId.toUpperCase()}]};
 const db=fixture();let writes=0;
 const result=await applyVerifiedPullBatch({db,batch:own,scope,...signed(own),applyEvent:async()=>{writes++;return true;}});
 assert.deepEqual(result,{status:"applied",nextCursor:5,count:0});
 assert.equal(writes,0);
 assert.equal(db.calls.at(-1),"commit");
});

test("signed self echo accepts MariaDB UUID casing but rejects a different tenant",async()=>{
 const mixedScope={...scope,tenantId:"a"+scope.tenantId.slice(1),branchId:"b"+scope.branchId.slice(1)};
 const e={...event(5),tenant_id:mixedScope.tenantId,branch_id:mixedScope.branchId,source_device_id:mixedScope.deviceId};
 const local={eventId:e.event_id,tenantId:e.tenant_id,branchId:e.branch_id,actorId:e.actor_id,entityId:e.entity_id,entityType:e.entity_type,operation:e.operation,baseVersion:e.base_version,timestamp:e.event_timestamp,payload:e.payload_json};
 e.payload_digest=digestChange(local);
 const own={...batch,tenantId:mixedScope.tenantId,branchId:mixedScope.branchId,events:[e]};
 const stored={tenant_id:mixedScope.tenantId.toUpperCase(),branch_id:mixedScope.branchId.toUpperCase(),payload_digest:e.payload_digest,event_payload:JSON.stringify(local)};
 const db=fixture({echoRowOverrides:stored});
 let writes=0;
 const result=await applyVerifiedPullBatch({db,batch:own,scope:mixedScope,...signed(own,mixedScope),applyEvent:async()=>{writes++;return true;}});
 assert.deepEqual(result,{status:"applied",nextCursor:5,count:0});
 assert.equal(writes,0,"local order must not be applied twice");
 assert.equal(db.calls.at(-1),"commit");
 const foreign=fixture({echoRowOverrides:{...stored,tenant_id:"c"+mixedScope.tenantId.slice(1)}});
 await assert.rejects(()=>applyVerifiedPullBatch({db:foreign,batch:own,scope:mixedScope,...signed(own,mixedScope),applyEvent:async()=>{throw Error("FOREIGN_WRITE");}}),/SYNC_LOCAL_ECHO_UNPROVEN/);
 assert.equal(foreign.calls.at(-1),"rollback");
 assert.ok(!foreign.calls.some(x=>x.startsWith("UPDATE foon_sync_device_cursors")));
});

test("signed inventory pull accepts casing-only movement UUID but rejects foreign movement identity",async()=>{
 const eventId="a1b2c3d4-e5f6-4a1b-8c2d-123456789abc";
 const movement={...event(5),event_id:eventId,entity_id:eventId.toUpperCase(),entity_type:"inventory_movement",operation:"movement",payload_json:{itemId:ids[0],delta:-1}};
 const envelope={eventId:movement.event_id,tenantId:movement.tenant_id,branchId:movement.branch_id,actorId:movement.actor_id,entityId:movement.entity_id,entityType:movement.entity_type,operation:movement.operation,baseVersion:movement.base_version,timestamp:movement.event_timestamp,payload:movement.payload_json};
 movement.payload_digest=digestChange(envelope);
 const valid={...batch,events:[movement]};
 const db=fixture();let applied=0;
 const result=await applyVerifiedPullBatch({db,batch:valid,scope,...signed(valid),applyEvent:async()=>{applied++;return true;}});
 assert.equal(result.count,1);assert.equal(applied,1);assert.equal(db.calls.at(-1),"commit");
 const wrong={...movement,entity_id:ids[2]};
 const wrongEnvelope={...envelope,entityId:wrong.entity_id};
 wrong.payload_digest=digestChange(wrongEnvelope);
 const invalid={...batch,events:[wrong]};
 const rejected=fixture();
 await assert.rejects(()=>applyVerifiedPullBatch({db:rejected,batch:invalid,scope,...signed(invalid),applyEvent:async()=>{throw Error("SHOULD_NOT_APPLY");}}),/SYNC_CORRUPT_REMOTE_VERSION/);
 assert.deepEqual(rejected.calls,[]);
});

test("signed pull rejects coerced persisted cursors without applying events",async()=>{
 for(const invalid of [null,[],[4],{valueOf:()=>4},"4e0"," 4 ","04"]){
  const db=fixture({cursor:invalid});let writes=0;
  await assert.rejects(()=>applyVerifiedPullBatch({db,...signed(),batch,scope,applyEvent:async()=>{writes++;return true;}}),/SYNC_CURSOR_CONFLICT/);
  assert.equal(writes,0);
  assert.equal(db.calls.at(-1),"rollback");
  assert.ok(!db.calls.some(x=>x.startsWith("UPDATE foon_sync_device_cursors")));
 }
 const db=fixture({cursor:"4"});
 const result=await applyVerifiedPullBatch({db,...signed(),batch,scope,applyEvent:async()=>true});
 assert.equal(result.nextCursor,5);
 assert.equal(db.calls.at(-1),"commit");
});
