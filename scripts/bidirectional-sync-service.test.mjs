import test from "node:test";
import assert from "node:assert/strict";
import {recordAuthorizedChange,readAuthorizedChanges,readSignedAuthorizedChanges} from "../lib/platform/bidirectional-sync-service.mjs";
import {generateKeyPairSync} from "node:crypto";
import {verifySignedPullBatch} from "../lib/platform/bidirectional-sync-signature.mjs";
import {digestChange} from "../lib/platform/bidirectional-sync-contract.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555"];
const context={authenticated:true,enabled:true,revoked:false,suspended:false,expiresAt:"2099-01-01T00:00:00Z",deviceId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],grants:["catalog.write","catalog.read","sync.read"]};
const change={eventId:ids[4],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[0],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"coffee"}};
const catalogRow=(id=3)=>({id,event_id:change.eventId,tenant_id:change.tenantId,branch_id:change.branchId,
 actor_id:change.actorId,source_device_id:context.deviceId,entity_type:change.entityType,entity_id:change.entityId,
 operation:change.operation,base_version:change.baseVersion,next_version:1,event_timestamp:change.timestamp,
 payload_json:JSON.stringify(change.payload),payload_digest:digestChange(change)});
function dbFixture({existing=false,version=0}={}){
 const calls=[];
 return {calls,async beginTransaction(){calls.push("begin");},async commit(){calls.push("commit");},async rollback(){calls.push("rollback");},
  async execute(sql,args){calls.push(sql);
   if(sql.includes("SELECT payload_digest"))return [existing?[{payload_digest:"invalid",tenant_id:ids[1],branch_id:ids[2],source_device_id:ids[0]}]:[]];
   if(sql.includes("SELECT version"))return [version?[{version}]:[]];
   if(sql.includes("FROM foon_sync_changes WHERE tenant_id"))return [[catalogRow()]];
   return [{affectedRows:1}];
  }};
}
test("authorized update and journal share one transaction, commit last",async()=>{
 const db=dbFixture();
 let businessCalls=0;
 const result=await recordAuthorizedChange({db,verifiedContext:context,change,applyBusinessChange:async()=>{businessCalls++;db.calls.push("business");return true;}});
 assert.equal(result.status,"recorded");assert.equal(businessCalls,1);
 assert.equal(db.calls[0],"begin");assert.equal(db.calls.at(-1),"commit");
 assert.ok(db.calls.findIndex(x=>typeof x==="string"&&x.includes("INSERT INTO foon_sync_changes"))<db.calls.indexOf("business"));
});
test("business failure rolls back journal too",async()=>{
 const db=dbFixture();
 await assert.rejects(()=>recordAuthorizedChange({db,verifiedContext:context,change,applyBusinessChange:async()=>{throw Error("INVENTORY_BLOCKED");}}),/INVENTORY_BLOCKED/);
 assert.equal(db.calls.at(-1),"rollback");assert.ok(!db.calls.includes("commit"));
});
test("wrong tenant and missing adapter fail without opening transaction",async()=>{
 const db=dbFixture();
 await assert.rejects(()=>recordAuthorizedChange({db,verifiedContext:context,change:{...change,tenantId:ids[4]},applyBusinessChange:async()=>{}}),/SYNC_SCOPE_FORBIDDEN/);
 await assert.rejects(()=>recordAuthorizedChange({db,verifiedContext:context,change}),/SYNC_BUSINESS_ADAPTER_REQUIRED/);
 assert.deepEqual(db.calls,[]);
});
test("stale versions never invoke business adapter",async()=>{
 const db=dbFixture({version:2});let writes=0;
 const result=await recordAuthorizedChange({db,verifiedContext:context,change,applyBusinessChange:async()=>{writes++;}});
 assert.equal(result.status,"conflict");assert.equal(writes,0);assert.equal(db.calls.at(-1),"rollback");
});
test("authorized read restricts pull by tenant and branch",async()=>{
 const db=dbFixture();
 const out=await readAuthorizedChanges({db,verifiedContext:context,request:{tenantId:ids[1],branchId:ids[2],after:0}});
 assert.equal(out.nextCursor,3);
 await assert.rejects(()=>readAuthorizedChanges({db,verifiedContext:context,request:{tenantId:ids[4],branchId:ids[2]}}),/SYNC_SCOPE_FORBIDDEN/);
});

test("generic sync.read alone never leaks customers, staff or order contents",async()=>{
 const db=dbFixture();
 db.execute=async(sql)=>{
  if(sql.includes("FROM foon_sync_changes WHERE tenant_id"))return [[
   {id:1,tenant_id:ids[1],branch_id:ids[2],entity_type:"customer_reference",payload_json:'{"private":"x"}'},
   {id:2,tenant_id:ids[1],branch_id:ids[2],entity_type:"staff_assignment",payload_json:'{"private":"y"}'},
   catalogRow(3),
   {id:4,tenant_id:ids[1],branch_id:ids[2],entity_type:"order",payload_json:'{"private":"z"}'}
  ]];
  return [[]];
 };
 const result=await readAuthorizedChanges({db,verifiedContext:context,request:{tenantId:ids[1],branchId:ids[2]}});
 assert.deepEqual(result.events.map(x=>x.entity_type),["catalog_item"]);
 assert.equal(result.nextCursor,4,"cursor advances past filtered unauthorized rows without exposing them");
 const noCatalog=await readAuthorizedChanges({db,verifiedContext:{...context,grants:["sync.read"]},request:{tenantId:ids[1],branchId:ids[2]}});
 assert.deepEqual(noCatalog.events,[]);
});

test("business adapter must explicitly confirm applied mutation before committing journal",async()=>{
 const db=dbFixture();
 await assert.rejects(()=>recordAuthorizedChange({db,verifiedContext:context,change,applyBusinessChange:async()=>undefined}),/SYNC_BUSINESS_APPLY_UNCONFIRMED/);
 assert.equal(db.calls.at(-1),"rollback");
 assert.ok(!db.calls.includes("commit"));
 const zeroDb=dbFixture();
 await assert.rejects(()=>recordAuthorizedChange({db:zeroDb,verifiedContext:context,change,applyBusinessChange:async()=>({affectedRows:0})}),/SYNC_BUSINESS_APPLY_UNCONFIRMED/);
 assert.equal(zeroDb.calls.at(-1),"rollback");
});

test("failed commit triggers rollback and does not report recorded",async()=>{
 const db=dbFixture();
 db.commit=async()=>{db.calls.push("commit-failed");throw Error("DB_COMMIT_FAILED");};
 await assert.rejects(()=>recordAuthorizedChange({db,verifiedContext:context,change,applyBusinessChange:async()=>true}),/DB_COMMIT_FAILED/);
 assert.equal(db.calls.at(-1),"rollback");
 assert.equal(db.calls.filter(x=>x==="rollback").length,1);
});
test("stale change is rolled back exactly once",async()=>{
 const db=dbFixture({version:3});
 const result=await recordAuthorizedChange({db,verifiedContext:context,change,applyBusinessChange:async()=>true});
 assert.equal(result.status,"conflict");
 assert.equal(db.calls.filter(x=>x==="rollback").length,1);
});

test("authorized filtered feed is signed for the enrolled device",async()=>{
 const db=dbFixture();
 const pair=generateKeyPairSync("ed25519");
 const privateKey=pair.privateKey.export({format:"pem",type:"pkcs8"});
 const publicKey=pair.publicKey.export({format:"pem",type:"spki"});
 const request={tenantId:ids[1],branchId:ids[2],after:0,limit:100};
 const signed=await readSignedAuthorizedChanges({db,verifiedContext:context,request,privateKey});
 assert.equal(signed.events.length,1);
 assert.equal(verifySignedPullBatch({batch:signed,scope:{...request,deviceId:context.deviceId},signature:signed.signature,publicKey}),true);
});
test("signed read refuses unauthorized branch before signing",async()=>{
 const db=dbFixture();const pair=generateKeyPairSync("ed25519");
 const privateKey=pair.privateKey.export({format:"pem",type:"pkcs8"});
 await assert.rejects(()=>readSignedAuthorizedChanges({db,verifiedContext:context,request:{tenantId:ids[1],branchId:ids[4]},privateKey}),/SYNC_SCOPE_FORBIDDEN/);
 assert.deepEqual(db.calls,[]);
});

// A filtered-out order/reservation must not hide a cross-tenant/branch journal
// row and silently advance the Windows cursor past valid business events.
test("unauthorized cross-scope rows fail before cursor advancement or signing",async()=>{
 for(const wrong of [{tenant_id:ids[4]},{branch_id:ids[4]}]){
  const db=dbFixture();
  db.execute=async(sql)=>sql.includes("FROM foon_sync_changes WHERE tenant_id")?[[{...catalogRow(8),entity_type:"order",...wrong}]]:[[]];
  await assert.rejects(()=>readAuthorizedChanges({db,verifiedContext:context,request:{tenantId:ids[1],branchId:ids[2]}}),/SYNC_FEED_SCOPE_MISMATCH/);
  const pair=generateKeyPairSync("ed25519");
  const privateKey=pair.privateKey.export({format:"pem",type:"pkcs8"});
  await assert.rejects(()=>readSignedAuthorizedChanges({db,verifiedContext:context,request:{tenantId:ids[1],branchId:ids[2]},privateKey}),/SYNC_FEED_SCOPE_MISMATCH/);
 }
});


test("signed order, inventory and reservation feeds accept casing-only UUID differences without weakening isolation",async()=>{
 const tenant="a1b2c3d4-e5f6-4a1b-8c2d-123456789abc";
 const branch="b1c2d3e4-f5a6-4b1c-8d2e-abcdef123456";
 const ctx={...context,tenantId:tenant,branchId:branch,grants:["sync.read","orders.read","inventory.read","reservations.read"]};
 const pair=generateKeyPairSync("ed25519");
 const privateKey=pair.privateKey.export({format:"pem",type:"pkcs8"});
 const publicKey=pair.publicKey.export({format:"pem",type:"spki"});
 const request={tenantId:tenant,branchId:branch,after:0,limit:100};
 for(const entityType of ["order","inventory_movement","reservation"]){
  const movement=entityType==="inventory_movement";
  const entry={...change,tenantId:tenant.toUpperCase(),branchId:branch.toUpperCase(),
   entityType,operation:movement?"movement":"upsert",
   entityId:movement?change.eventId:change.entityId,
   payload:movement?{itemId:ids[0],delta:-1}:{status:"pending"}};
  const row={id:9,event_id:entry.eventId,tenant_id:entry.tenantId,branch_id:entry.branchId,
   actor_id:entry.actorId,source_device_id:ctx.deviceId,entity_type:entry.entityType,
   entity_id:entry.entityId,operation:entry.operation,base_version:0,next_version:1,
   event_timestamp:entry.timestamp,payload_json:JSON.stringify(entry.payload),payload_digest:digestChange(entry)};
  const db={async execute(sql){return [sql.includes("FROM foon_sync_changes WHERE tenant_id")?[row]:[]];}};
  const signed=await readSignedAuthorizedChanges({db,verifiedContext:ctx,request,privateKey});
  assert.equal(signed.events.length,1);
  assert.equal(signed.events[0].tenant_id,entry.tenantId,"preserve digest-bound UUID casing");
  assert.equal(signed.events[0].branch_id,entry.branchId);
  assert.equal(signed.nextCursor,9);
  assert.equal(verifySignedPullBatch({batch:signed,scope:{...request,deviceId:ctx.deviceId},signature:signed.signature,publicKey}),true);
  for(const changed of [{tenant_id:ids[4]},{branch_id:ids[4]}]){
   const denied={async execute(sql){return [sql.includes("FROM foon_sync_changes WHERE tenant_id")?[{...row,...changed}]:[]];}};
   await assert.rejects(()=>readSignedAuthorizedChanges({db:denied,verifiedContext:ctx,request,privateKey}),/SYNC_FEED_SCOPE_MISMATCH/);
  }
 }
});
