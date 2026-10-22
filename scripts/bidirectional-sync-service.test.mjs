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
   {id:1,entity_type:"customer_reference",payload_json:'{"private":"x"}'},
   {id:2,entity_type:"staff_assignment",payload_json:'{"private":"y"}'},
   catalogRow(3),
   {id:4,entity_type:"order",payload_json:'{"private":"z"}'}
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
