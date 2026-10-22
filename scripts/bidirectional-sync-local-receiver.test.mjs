import test from "node:test";
import assert from "node:assert/strict";
import {applyVerifiedPullBatch} from "../lib/platform/bidirectional-sync-local-receiver.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"];
const scope={deviceId:ids[0],tenantId:ids[1],branchId:ids[2],after:4,limit:10};
const event=(id)=>({id,event_id:ids[0],tenant_id:ids[1],branch_id:ids[2],payload_digest:"a".repeat(64)});
const batch={ok:true,tenantId:ids[1],branchId:ids[2],events:[event(5)],nextCursor:5};
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
 const r=await applyVerifiedPullBatch({db,verifiedServer:true,batch,scope,applyEvent:async()=>{count++;return true;}});
 assert.deepEqual(r,{status:"applied",nextCursor:5,count:1});
 assert.equal(count,1);assert.equal(db.calls.at(-1),"commit");assert.equal(db.calls.filter(x=>x==="rollback").length,0);
});
test("rejected server identity never opens a transaction",async()=>{
 const db=fixture();
 await assert.rejects(()=>applyVerifiedPullBatch({db,verifiedServer:false,batch,scope,applyEvent:async()=>true}),/SYNC_SERVER_VERIFICATION_REQUIRED/);
 assert.deepEqual(db.calls,[]);
});
test("failed local entity write rolls back cursor and all changes",async()=>{
 const db=fixture();
 await assert.rejects(()=>applyVerifiedPullBatch({db,verifiedServer:true,batch,scope,applyEvent:async()=>false}),/SYNC_LOCAL_APPLY_UNCONFIRMED/);
 assert.equal(db.calls.at(-1),"rollback");assert.ok(!db.calls.includes("commit"));
});
test("stale cursor rejects replay before invoking any adapter",async()=>{
 const db=fixture({cursor:5});let writes=0;
 await assert.rejects(()=>applyVerifiedPullBatch({db,verifiedServer:true,batch,scope,applyEvent:async()=>{writes++;return true;}}),/SYNC_CURSOR_CONFLICT/);
 assert.equal(writes,0);assert.equal(db.calls.at(-1),"rollback");
});
test("lost cursor update aborts whole transaction",async()=>{
 const db=fixture({updateCount:0});
 await assert.rejects(()=>applyVerifiedPullBatch({db,verifiedServer:true,batch,scope,applyEvent:async()=>true}),/SYNC_CURSOR_WRITE_CONFLICT/);
 assert.equal(db.calls.at(-1),"rollback");assert.ok(!db.calls.includes("commit"));
});
test("invalid cross-branch event fails before opening transaction",async()=>{
 const db=fixture();
 await assert.rejects(()=>applyVerifiedPullBatch({db,verifiedServer:true,batch:{...batch,events:[{...event(5),branch_id:ids[0]}]},scope,applyEvent:async()=>true}),/SYNC_BATCH_SCOPE_MISMATCH/);
 assert.deepEqual(db.calls,[]);
});
