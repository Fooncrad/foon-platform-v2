import test from "node:test";
import assert from "node:assert/strict";
import {applyEdgeOrderMutation} from "../lib/platform/edge-sync-order-mutation.mjs";
const base={kind:"status",orderId:"order-1",tenantId:"tenant-1",branchId:"branch-1",payload:{id:"order-1",status:"preparing"}};
function mock(status="new"){
 const calls=[];
 const connection={async execute(sql,params){
  calls.push({sql,params});
  if(sql.startsWith("SELECT"))return [[{status}]];
  return [{affectedRows:1}];
 }};
 return {connection,calls};
}
test("status update locks and scopes order by tenant and branch",async()=>{
 const {connection,calls}=mock();
 await applyEdgeOrderMutation(connection,base);
 assert.match(calls[0].sql,/FOR UPDATE/);
 assert.deepEqual(calls[0].params,["order-1","tenant-1","branch-1"]);
 assert.deepEqual(calls[1].params,["preparing","order-1","tenant-1","branch-1","new"]);
});
test("invalid transitions cannot change paid/completed order",async()=>{
 const {connection,calls}=mock("completed");
 await assert.rejects(()=>applyEdgeOrderMutation(connection,base),/EDGE_INVALID_STATUS_TRANSITION/);
 assert.equal(calls.length,1);
});
test("unpriced offline creation remains blocked",async()=>{
 await assert.rejects(()=>applyEdgeOrderMutation(mock().connection,{...base,kind:"created"}),/EDGE_ORDER_PRICING_NOT_IMPLEMENTED/);
});
test("missing order and cross-branch lookup cannot mutate",async()=>{
 let updated=false;
 const connection={async execute(sql){if(sql.startsWith("SELECT"))return [[]];updated=true;return [{affectedRows:1}];}};
 await assert.rejects(()=>applyEdgeOrderMutation(connection,base),/EDGE_ORDER_NOT_FOUND/);
 assert.equal(updated,false);
});
