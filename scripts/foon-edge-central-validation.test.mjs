import {eventDigest} from "./foon-edge-sync-contract.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {validateIncomingEdgeEvent} from "../lib/platform/edge-sync-validation.mjs";

test("central edge validation enforces authenticated tenant, branch and device",()=>{
 const identity={tenantId:"tenant-1",branchId:"branch-1",deviceId:"device-1"};
 const event={tenantId:"tenant-1",branchId:"branch-1",deviceId:"device-1",eventSeq:1,kind:"created",orderId:"11111111-1111-4111-8111-111111111111",digest:"",payload:{id:"11111111-1111-4111-8111-111111111111",items:[{id:"22222222-2222-4222-8222-222222222222",quantity:1}]}};
 event.digest=eventDigest({seq:event.eventSeq,order_id:event.orderId,kind:event.kind,payload:event.payload});
 assert.equal(validateIncomingEdgeEvent(event,identity).ok,true);
 for(const field of ["tenantId","branchId","deviceId"])assert.equal(validateIncomingEdgeEvent({...event,[field]:"other"},identity).error,"EDGE_SCOPE_MISMATCH");
 assert.equal(validateIncomingEdgeEvent(event,null).error,"DEVICE_UNAUTHORIZED");
 assert.equal(validateIncomingEdgeEvent({...event,eventSeq:0},identity).error,"INVALID_EDGE_EVENT");
 const changedPayload={...event.payload,id:"other"};
 assert.equal(validateIncomingEdgeEvent({...event,payload:changedPayload},identity).error,"EDGE_DIGEST_MISMATCH");
 const withDigest=(overrides)=>{const candidate={...event,...overrides};return {...candidate,digest:eventDigest({seq:candidate.eventSeq,order_id:candidate.orderId,kind:candidate.kind,payload:candidate.payload})};};
 assert.equal(validateIncomingEdgeEvent(withDigest({payload:changedPayload}),identity).error,"EDGE_ORDER_MISMATCH");
 assert.equal(validateIncomingEdgeEvent(withDigest({payload:{...event.payload,branchId:"other-branch"}}),identity).error,"EDGE_PAYLOAD_SCOPE_MISMATCH");
 assert.equal(validateIncomingEdgeEvent(withDigest({payload:{...event.payload,tenantId:"other-tenant"}}),identity).error,"EDGE_PAYLOAD_SCOPE_MISMATCH");
 assert.equal(validateIncomingEdgeEvent(withDigest({payload:{...event.payload,branchId:identity.branchId,tenantId:identity.tenantId}}),identity).ok,true);
 assert.equal(validateIncomingEdgeEvent(withDigest({payload:{id:"11111111-1111-4111-8111-111111111111",items:[]}}),identity).error,"INVALID_EDGE_ORDER");
 assert.equal(validateIncomingEdgeEvent(withDigest({payload:{id:event.orderId,items:[{id:"bad",quantity:1}]}}),identity).error,"INVALID_EDGE_ORDER_ITEMS");
 assert.equal(validateIncomingEdgeEvent(withDigest({payload:{id:event.orderId,items:[{id:event.payload.items[0].id,quantity:1},{id:event.payload.items[0].id,quantity:2}]}}),identity).error,"INVALID_EDGE_ORDER_ITEMS");
 assert.equal(validateIncomingEdgeEvent(withDigest({kind:"status",payload:{id:"11111111-1111-4111-8111-111111111111",status:"invalid"}}),identity).error,"INVALID_EDGE_STATUS");
 assert.equal(validateIncomingEdgeEvent(withDigest({kind:"status",payload:{id:event.orderId,status:"ready",payment_status:"paid"}}),identity).error,"INVALID_EDGE_STATUS");
 assert.equal(validateIncomingEdgeEvent(withDigest({kind:"status",payload:{id:event.orderId,status:"ready"}}),identity).ok,true);
});
