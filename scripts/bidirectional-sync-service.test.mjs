import test from "node:test";
import assert from "node:assert/strict";
import {recordAuthorizedChange,readAuthorizedChanges} from "../lib/platform/bidirectional-sync-service.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555"];
const context={authenticated:true,enabled:true,revoked:false,suspended:false,expiresAt:"2099-01-01T00:00:00Z",deviceId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],grants:["catalog.write","catalog.read","sync.read"]};
const change={eventId:ids[4],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[0],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"coffee"}};
function dbFixture({existing=false,version=0}={}){
 const calls=[];
 return {calls,async beginTransaction(){calls.push("begin");},async commit(){calls.push("commit");},async rollback(){calls.push("rollback");},
  async execute(sql,args){calls.push(sql);
   if(sql.includes("SELECT payload_digest"))return [existing?[{payload_digest:"invalid",tenant_id:ids[1],branch_id:ids[2],source_device_id:ids[0]}]:[]];
   if(sql.includes("SELECT version"))return [version?[{version}]:[]];
   if(sql.includes("FROM foon_sync_changes WHERE tenant_id"))return [[{id:3,event_id:ids[4],entity_type:"catalog_item"}]];
   return [{affectedRows:1}];
  }};
}
test("authorized update and journal share one transaction, commit last",async()=>{
 const db=dbFixture();
 let businessCalls=0;
 const result=await recordAuthorizedChange({db,verifiedContext:context,change,applyBusinessChange:async()=>{businessCalls++;db.calls.push("business");}});
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
   {id:3,entity_type:"catalog_item",payload_json:'{"name":"coffee"}'},
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
