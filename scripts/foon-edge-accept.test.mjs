import {eventDigest} from "./foon-edge-sync-contract.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {acceptEdgeEvent} from "../lib/platform/edge-sync-accept.mjs";

const identity={tenantId:"tenant",branchId:"branch",deviceId:"device"};
const event={tenantId:"tenant",branchId:"branch",deviceId:"device",eventSeq:1,kind:"created",orderId:"11111111-1111-4111-8111-111111111111",digest:"",payload:{id:"11111111-1111-4111-8111-111111111111",items:[{id:"22222222-2222-4222-8222-222222222222",quantity:1}]}};
test("central inbox commits once and returns same receipt for duplicate",async()=>{
 event.digest=eventDigest({seq:event.eventSeq,order_id:event.orderId,kind:event.kind,payload:event.payload});
 const inbox=new Map();let mutations=0;
 const adapter={transaction:async fn=>fn({insertInbox:async e=>{const key=e.deviceId+":"+e.eventSeq;const previous=inbox.get(key);if(previous)return {type:"duplicate",...previous};const row={digest:e.digest,receipt:{receiptId:"receipt-123",deviceId:e.deviceId,eventSeq:e.eventSeq}};inbox.set(key,row);return {type:"inserted",receipt:row.receipt};},applyMutation:async()=>{mutations++;}})};
 assert.equal((await acceptEdgeEvent(event,identity,adapter)).status,201);
 assert.equal((await acceptEdgeEvent(event,identity,adapter)).status,200);
 assert.equal(mutations,1);
 const changed={...event,payload:{...event.payload,items:[{id:"22222222-2222-4222-8222-222222222222",quantity:2}]}};
 changed.digest=eventDigest({seq:changed.eventSeq,order_id:changed.orderId,kind:changed.kind,payload:changed.payload});
 assert.equal((await acceptEdgeEvent(changed,identity,adapter)).status,409);
 assert.equal(mutations,1);
 assert.equal((await acceptEdgeEvent({...event,branchId:"wrong"},identity,adapter)).status,403);
 assert.equal(mutations,1);
});
test("transactional adapter is mandatory",async()=>{
 await assert.rejects(()=>acceptEdgeEvent(event,identity,{}),/EDGE_TRANSACTION_REQUIRED/);
});
