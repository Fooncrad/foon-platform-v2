import {eventDigest} from "./foon-edge-sync-contract.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {validateIncomingEdgeEvent} from "../lib/platform/edge-sync-validation.mjs";

test("central edge validation enforces authenticated tenant, branch and device",()=>{
 const identity={tenantId:"tenant-1",branchId:"branch-1",deviceId:"device-1"};
 const event={tenantId:"tenant-1",branchId:"branch-1",deviceId:"device-1",eventSeq:1,kind:"created",orderId:"order-1",digest:"",payload:{id:"order-1",items:[{id:"item-1",quantity:1}]}};
 event.digest=eventDigest({seq:event.eventSeq,order_id:event.orderId,kind:event.kind,payload:event.payload});
 assert.equal(validateIncomingEdgeEvent(event,identity).ok,true);
 for(const field of ["tenantId","branchId","deviceId"])assert.equal(validateIncomingEdgeEvent({...event,[field]:"other"},identity).error,"EDGE_SCOPE_MISMATCH");
 assert.equal(validateIncomingEdgeEvent(event,null).error,"DEVICE_UNAUTHORIZED");
 assert.equal(validateIncomingEdgeEvent({...event,eventSeq:0},identity).error,"INVALID_EDGE_EVENT");
 assert.equal(validateIncomingEdgeEvent({...event,payload:{...event.payload,id:"other"}},identity).error,"EDGE_ORDER_MISMATCH");
 assert.equal(validateIncomingEdgeEvent({...event,payload:{id:"order-1",items:[]}},identity).error,"INVALID_EDGE_ORDER");
 assert.equal(validateIncomingEdgeEvent({...event,kind:"status",payload:{id:"order-1",status:"invalid"}},identity).error,"INVALID_EDGE_STATUS");
});
