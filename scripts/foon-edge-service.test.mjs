import test from "node:test";
import assert from "node:assert/strict";
import {acceptAndSignEdgeEvent} from "../lib/platform/edge-sync-service.mjs";
import {verifyCloudReceiptSignature} from "../lib/platform/edge-sync-receipt-signature.mjs";
import {eventDigest} from "./foon-edge-sync-contract.mjs";
const secret="secure-server-receipt-key-123456789012345";
const identity={tenantId:"t",branchId:"b",deviceId:"d"};
const event={tenantId:"t",branchId:"b",deviceId:"d",eventSeq:1,kind:"created",orderId:"11111111-1111-4111-8111-111111111111",payload:{id:"11111111-1111-4111-8111-111111111111",items:[{id:"22222222-2222-4222-8222-222222222222",quantity:1}]}};
event.digest=eventDigest({seq:1,order_id:"11111111-1111-4111-8111-111111111111",kind:"created",payload:event.payload});

test("signed receipt only appears after successful transaction",async()=>{
 let committed=false;
 const adapter={transaction:async fn=>{const result=await fn({insertInbox:async()=>({type:"inserted",receipt:{receiptId:"receipt-123",deviceId:"d",eventSeq:1,orderId:"11111111-1111-4111-8111-111111111111",digest:event.digest}}),applyMutation:async()=>{}});committed=true;return result;}};
 const result=await acceptAndSignEdgeEvent(event,identity,adapter,secret);
 assert.equal(committed,true);
 assert.equal(result.status,201);
 assert.equal(verifyCloudReceiptSignature(result.receipt,secret),true);
});
test("failed commit cannot produce a signed receipt",async()=>{
 const adapter={transaction:async fn=>{await fn({insertInbox:async()=>({type:"inserted",receipt:{receiptId:"receipt-123",deviceId:"d",eventSeq:1,orderId:"11111111-1111-4111-8111-111111111111",digest:event.digest}}),applyMutation:async()=>{}});throw Error("COMMIT_FAILED");}};
 await assert.rejects(()=>acceptAndSignEdgeEvent(event,identity,adapter,secret),/COMMIT_FAILED/);
});
test("invalid device scope never produces a receipt",async()=>{
 const adapter={transaction:async()=>{throw Error("should not run");}};
 const result=await acceptAndSignEdgeEvent({...event,branchId:"other"},identity,adapter,secret);
 assert.equal(result.status,403);
 assert.equal(result.receipt,undefined);
});
