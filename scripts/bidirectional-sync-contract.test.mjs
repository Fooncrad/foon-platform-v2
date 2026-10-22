import test from "node:test";
import assert from "node:assert/strict";
import {validateChangeEnvelope,resolveChange,digestChange,validatePullCursor} from "../lib/platform/bidirectional-sync-contract.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555"];
const c={eventId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[4],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"قهوة",price:12}};
test("new version zero change applies; duplicate is idempotent",()=>{assert.equal(resolveChange({incoming:c,current:null}).status,"apply");assert.equal(resolveChange({incoming:c,current:null,alreadyApplied:true}).status,"duplicate");});
test("stale update does not overwrite cloud version",()=>{const current={tenantId:c.tenantId,branchId:c.branchId,entityId:c.entityId,entityType:c.entityType,version:3};assert.equal(resolveChange({incoming:{...c,baseVersion:2},current}).status,"conflict");assert.deepEqual(resolveChange({incoming:{...c,baseVersion:3},current}),{status:"apply",nextVersion:4});});
test("branch and tenant separation enforced before writes",()=>{const current={tenantId:ids[3],branchId:c.branchId,entityId:c.entityId,entityType:c.entityType,version:0};assert.equal(resolveChange({incoming:c,current}).reason,"SYNC_SCOPE_MISMATCH");});
test("reject forged payload, invalid operation, invalid cursor",()=>{assert.throws(()=>validateChangeEnvelope({...c,entityType:"users",payload:{password:"secret"}}),/SYNC_UNSUPPORTED_ENTITY/);assert.throws(()=>validateChangeEnvelope({...c,operation:"movement"}),/SYNC_INVALID_OPERATION/);assert.throws(()=>validatePullCursor(-1),/SYNC_INVALID_CURSOR/);assert.equal(validatePullCursor(0),0);});
test("event digests deterministic and payload not mutated",()=>{assert.equal(digestChange(c),digestChange(c));const envelope=validateChangeEnvelope(c);envelope.payload.name="different";assert.equal(c.payload.name,"قهوة");});

test("nested payload keys have stable digest independent of insertion order",()=>{
 const a={...c,payload:{item:{name:"قهوة",options:[{size:"large",price:15}]},count:1}};
 const b={...c,payload:{count:1,item:{options:[{price:15,size:"large"}],name:"قهوة"}}};
 assert.equal(digestChange(a),digestChange(b));
 assert.notEqual(digestChange(a),digestChange({...a,payload:{...a.payload,count:2}}));
});
test("rejects non-JSON payload values and prototype pollution keys",()=>{
 for(const payload of [{x:undefined},{x:NaN},{x:Infinity},{x:()=>1},{x:1n},JSON.parse('{"__proto__":{"admin":true}}')]){
  assert.throws(()=>validateChangeEnvelope({...c,payload}),/SYNC_INVALID_PAYLOAD/);
 }
});
