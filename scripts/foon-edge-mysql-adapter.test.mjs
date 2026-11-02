import test from "node:test";
import assert from "node:assert/strict";
import {mysqlEdgeInboxAdapter} from "../lib/platform/edge-sync-mysql-adapter.mjs";
import {acceptEdgeEvent} from "../lib/platform/edge-sync-accept.mjs";
import {eventDigest} from "./foon-edge-sync-contract.mjs";

const identity={tenantId:"t",branchId:"b",deviceId:"d"};
const event={tenantId:"t",branchId:"b",deviceId:"d",eventSeq:1,kind:"created",orderId:"11111111-1111-4111-8111-111111111111",payload:{id:"11111111-1111-4111-8111-111111111111",branchId:"b",items:[{id:"22222222-2222-4222-8222-222222222222",quantity:1}]}};
event.digest=eventDigest({seq:1,order_id:"11111111-1111-4111-8111-111111111111",kind:"created",payload:event.payload});

function fakePool(){
 const state={inbox:new Map(),mutations:0,commits:0,rollbacks:0};
 return {state,async getConnection(){
  let staged=null;
  return {
   async beginTransaction(){staged=new Map(state.inbox);},
   async execute(sql,params){
    if(sql.startsWith("INSERT")){
     const key=params[2]+":"+params[3];
     if(staged.has(key)){const e=new Error("duplicate");e.code="ER_DUP_ENTRY";throw e;}
     staged.set(key,{tenant_id:params[0],branch_id:params[1],device_id:params[2],event_seq:params[3],event_kind:params[4],order_id:params[5],payload_sha256:params[6],receipt_id:params[7]});
     return [{affectedRows:1}];
    }
    if(sql.startsWith("SELECT")){const key=params[0]+":"+params[1];return [[staged.get(key)].filter(Boolean)];}
    throw Error("Unexpected SQL");
   },
   async commit(){state.inbox=staged;state.commits++;},
   async rollback(){state.rollbacks++;},
   release(){}
  };
 }};
}
test("MySQL adapter returns original receipt and never reapplies replay",async()=>{
 const pool=fakePool();
 const adapter=mysqlEdgeInboxAdapter(pool,async()=>{pool.state.mutations++;});
 const first=await acceptEdgeEvent(event,identity,adapter);
 const replay=await acceptEdgeEvent(event,identity,adapter);
 assert.equal(first.status,201);assert.equal(replay.status,200);
 assert.equal(first.receipt.receiptId,replay.receipt.receiptId);
 assert.equal(pool.state.mutations,1);assert.equal(pool.state.inbox.size,1);
 const changed={...event,payload:{...event.payload,items:[{id:"22222222-2222-4222-8222-222222222222",quantity:2}]}};
 changed.digest=eventDigest({seq:1,order_id:"11111111-1111-4111-8111-111111111111",kind:"created",payload:changed.payload});
 assert.equal((await acceptEdgeEvent(changed,identity,adapter)).status,409);
 assert.equal(pool.state.mutations,1);
});
test("failed business mutation rolls back inbox entry",async()=>{
 const pool=fakePool();
 const adapter=mysqlEdgeInboxAdapter(pool,async()=>{throw Error("BUSINESS_WRITE_FAILED");});
 await assert.rejects(()=>acceptEdgeEvent(event,identity,adapter),/BUSINESS_WRITE_FAILED/);
 assert.equal(pool.state.inbox.size,0);assert.equal(pool.state.rollbacks,1);assert.equal(pool.state.commits,0);
});
