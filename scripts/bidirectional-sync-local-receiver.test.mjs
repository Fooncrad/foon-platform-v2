import test from "node:test";
import assert from "node:assert/strict";
import {applyVerifiedPullBatch} from "../lib/platform/bidirectional-sync-local-receiver.mjs";
import {pullBatchSignatureMessage} from "../lib/platform/bidirectional-sync-signature.mjs";
import {generateKeyPairSync,sign} from "node:crypto";
import {digestChange} from "../lib/platform/bidirectional-sync-contract.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"];
const scope={deviceId:ids[0],tenantId:ids[1],branchId:ids[2],after:4,limit:10};
const event=(id)=>{const c={eventId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[0],entityId:ids[0],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"Coffee"}};return {id,event_id:c.eventId,tenant_id:c.tenantId,branch_id:c.branchId,actor_id:c.actorId,source_device_id:ids[0],entity_type:c.entityType,entity_id:c.entityId,operation:c.operation,base_version:c.baseVersion,next_version:1,event_timestamp:c.timestamp,payload_json:c.payload,payload_digest:digestChange(c)};};
const batch={ok:true,tenantId:ids[1],branchId:ids[2],events:[event(5)],nextCursor:5};
const pair=generateKeyPairSync("ed25519");
const publicKey=pair.publicKey.export({type:"spki",format:"pem"});
const signed=(b=batch,sc=scope)=>({signature:sign(null,pullBatchSignatureMessage(b,sc),pair.privateKey).toString("base64url"),publicKey});
function fixture({cursor=4,updateCount=1}={}){
 const calls=[];
 const db={calls,async beginTransaction(){calls.push("begin");},
 async commit(){calls.push("commit");},
 async rollback(){calls.push("rollback");},
 async execute(sql,args){
  calls.push(sql);
  if(sql.startsWith("SELECT last_pulled_id"))return [[{last_pulled_id:cursor}]];
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
