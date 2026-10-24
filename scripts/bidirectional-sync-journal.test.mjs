import test from "node:test";
import assert from "node:assert/strict";
import {appendScopedChange,pullScopedChanges} from "../lib/platform/bidirectional-sync-journal.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555"];
const change={eventId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[4],entityType:"catalog_item",operation:"upsert",baseVersion:0,timestamp:"2026-10-22T18:00:00Z",payload:{name:"test",price:12}};
test("appends event and version only through supplied transaction",async()=>{
 const queries=[];
 const db={async execute(sql,args){queries.push({sql,args});if(sql.includes("SELECT payload_digest"))return [[]];if(sql.includes("SELECT version"))return [[]];return [{affectedRows:1}]}};
 const result=await appendScopedChange(db,{change,sourceDeviceId:ids[3]});
 assert.equal(result.status,"recorded");
 assert.equal(queries.length,5);
 assert.match(queries[0].sql,/foon_sync_scope_locks/);
 assert.match(queries[3].sql,/INSERT INTO foon_sync_versions/);
 assert.match(queries[4].sql,/INSERT INTO foon_sync_changes/);
});
test("repeated same event reports duplicate; tampered payload fails",async()=>{
 let digest;
 const first={async execute(sql,args){if(sql.includes("SELECT payload_digest"))return [[]];if(sql.includes("SELECT version"))return [[]];if(sql.includes("INSERT INTO foon_sync_changes"))digest=args.at(-1);return [{affectedRows:1}]}};
 await appendScopedChange(first,{change,sourceDeviceId:ids[3]});
 const db={async execute(){return [[{payload_digest:digest,tenant_id:change.tenantId,branch_id:change.branchId,source_device_id:ids[3],next_version:1}]]}};
 assert.equal((await appendScopedChange(db,{change,sourceDeviceId:ids[3]})).status,"duplicate");
 await assert.rejects(()=>appendScopedChange(db,{change:{...change,payload:{price:99}},sourceDeviceId:ids[3]}),/SYNC_IDEMPOTENCY_CONFLICT/);
});
test("pull is branch scoped, bounded and monotone",async()=>{
 const db={async execute(sql,args){assert.match(sql,/tenant_id=\? AND branch_id=\?/);assert.deepEqual(args,[ids[1],ids[2],7,100]);return [[{id:8},{id:9}]]}};
 assert.deepEqual((await pullScopedChanges(db,{tenantId:ids[1],branchId:ids[2],after:7})).nextCursor,9);
 await assert.rejects(()=>pullScopedChanges(db,{tenantId:ids[1],branchId:ids[2],after:-1}),/SYNC_INVALID_CURSOR/);
});

test("replay from a different device cannot claim prior event",async()=>{
 let originalDigest;
 const capture={async execute(sql,args){if(sql.includes("SELECT payload_digest"))return [[]];if(sql.includes("SELECT version"))return [[]];if(sql.includes("INSERT INTO foon_sync_changes"))originalDigest=args.at(-1);return [{affectedRows:1}]}};
 await appendScopedChange(capture,{change,sourceDeviceId:ids[3]});
 const replay={async execute(){return [[{payload_digest:originalDigest,tenant_id:change.tenantId,branch_id:change.branchId,source_device_id:ids[4]}]]}};
 await assert.rejects(()=>appendScopedChange(replay,{change,sourceDeviceId:ids[3]}),/SYNC_IDEMPOTENCY_CONFLICT/);
});

test("scope mutex is acquired before idempotency and journal allocation",async()=>{
 const queries=[];
 const db={async execute(sql,args){queries.push(sql);if(sql.includes("SELECT payload_digest")||sql.includes("SELECT version"))return [[]];return [{affectedRows:1}];}};
 await appendScopedChange(db,{change,sourceDeviceId:ids[3]});
 assert.match(queries[0],/INSERT INTO foon_sync_scope_locks/);
 assert.match(queries[1],/SELECT payload_digest/);
 assert.match(queries.at(-1),/INSERT INTO foon_sync_changes/);
});

test("pull SQL includes scope fields required by strict receiver validation",async()=>{
 const db={async execute(sql,args){
  assert.match(sql,/SELECT id,event_id,tenant_id,branch_id,actor_id,source_device_id/);
  assert.deepEqual(args,[ids[1],ids[2],0,100]);
  return [[{id:1,event_id:ids[0],tenant_id:ids[1],branch_id:ids[2],payload_digest:"a".repeat(64)}]];
 }};
 const batch=await pullScopedChanges(db,{tenantId:ids[1],branchId:ids[2]});
 assert.equal(batch.events[0].tenant_id,ids[1]);
 assert.equal(batch.events[0].branch_id,ids[2]);
 assert.equal(batch.nextCursor,1);
});

test("existing entity version update must affect exactly one row",async()=>{
 const db={async execute(sql){
  if(sql.includes("SELECT payload_digest"))return [[]];
  if(sql.includes("SELECT version"))return [[{version:2,last_event_id:ids[4]}]];
  if(sql.includes("UPDATE foon_sync_versions"))return [{affectedRows:0}];
  return [{affectedRows:1}];
 }};
 await assert.rejects(()=>appendScopedChange(db,{change:{...change,baseVersion:2},sourceDeviceId:ids[3]}),/SYNC_VERSION_UPDATE_FAILED/);
});
test("updated entity version can record only after one version row changed",async()=>{
 const queries=[];
 const db={async execute(sql){
  queries.push(sql);
  if(sql.includes("SELECT payload_digest"))return [[]];
  if(sql.includes("SELECT version"))return [[{version:1,last_event_id:ids[4]}]];
  return [{affectedRows:1}];
 }};
 const outcome=await appendScopedChange(db,{change:{...change,baseVersion:1},sourceDeviceId:ids[3]});
 assert.equal(outcome.nextVersion,2);
 assert.ok(queries.some(sql=>sql.includes("UPDATE foon_sync_versions")));
});

test("same event replay returns persisted version without reapplying",async()=>{
 const digest=(await import("../lib/platform/bidirectional-sync-contract.mjs")).digestChange(change);
 let calls=0;
 const db={async execute(sql){
  calls++;
  if(sql.includes("SELECT payload_digest"))return [[{payload_digest:digest,tenant_id:change.tenantId,branch_id:change.branchId,source_device_id:ids[3],next_version:4}]];
  return [{affectedRows:1}];
 }};
 const result=await appendScopedChange(db,{change,sourceDeviceId:ids[3]});
 assert.deepEqual(result,{status:"duplicate",eventId:change.eventId,nextVersion:4});
 assert.equal(calls,2,"replay must not mutate entity or journal");
});
test("unsafe persisted version never advances or appends an event",async()=>{
 const db={async execute(sql){
  if(sql.includes("SELECT payload_digest"))return [[]];
  if(sql.includes("SELECT version"))return [[{version:"9007199254740992"}]];
  if(sql.includes("INSERT INTO foon_sync_changes"))throw Error("must not append");
  return [{affectedRows:1}];
 }};
 await assert.rejects(()=>appendScopedChange(db,{change:{...change,baseVersion:1},sourceDeviceId:ids[3]}),/SYNC_INVALID_STORED_VERSION/);
});

test("silent missing version insert blocks journal and requires transaction rollback",async()=>{
 let journalAttempted=false;
 const db={async execute(sql){
  if(sql.includes("SELECT payload_digest")||sql.includes("SELECT version"))return [[]];
  if(sql.includes("INSERT INTO foon_sync_versions"))return [{affectedRows:0}];
  if(sql.includes("INSERT INTO foon_sync_changes"))journalAttempted=true;
  return [{affectedRows:1}];
 }};
 await assert.rejects(()=>appendScopedChange(db,{change,sourceDeviceId:ids[3]}),/SYNC_VERSION_INSERT_FAILED/);
 assert.equal(journalAttempted,false);
});
test("silent missing journal insert never reports a successful change",async()=>{
 const db={async execute(sql){
  if(sql.includes("SELECT payload_digest")||sql.includes("SELECT version"))return [[]];
  if(sql.includes("INSERT INTO foon_sync_changes"))return [{affectedRows:0}];
  return [{affectedRows:1}];
 }};
 await assert.rejects(()=>appendScopedChange(db,{change,sourceDeviceId:ids[3]}),/SYNC_JOURNAL_INSERT_FAILED/);
});

test("journal idempotent replay accepts MariaDB UUID casing but rejects different scope or device",async()=>{
 const replayChange={...change,eventId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",tenantId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",branchId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",actorId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",entityId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"};
 const sourceDeviceId="ffffffff-ffff-4fff-8fff-ffffffffffff";
 const digest=(await import("../lib/platform/bidirectional-sync-contract.mjs")).digestChange(replayChange);
 const stored={payload_digest:digest,tenant_id:replayChange.tenantId.toUpperCase(),branch_id:replayChange.branchId.toUpperCase(),source_device_id:sourceDeviceId.toUpperCase(),next_version:1};
 const queries=[];
 const db={async execute(sql){queries.push(sql);return sql.includes("SELECT payload_digest")?[[stored]]:[{affectedRows:1}]}};
 assert.equal((await appendScopedChange(db,{change:replayChange,sourceDeviceId})).status,"duplicate");
 assert.equal(queries.length,2,"duplicate must not update version, business entity or journal");
 for(const key of ["tenant_id","branch_id","source_device_id"]){
  const changed={...stored,[key]:"11111111-1111-4111-8111-111111111111"};
  const denied={async execute(sql){return sql.includes("SELECT payload_digest")?[[changed]]:[{affectedRows:1}]}};
  await assert.rejects(()=>appendScopedChange(denied,{change:replayChange,sourceDeviceId}),/SYNC_IDEMPOTENCY_CONFLICT/);
 }
 for(const changed of [{...stored,payload_digest:"b".repeat(64)},{...stored,source_device_id:"not-a-uuid"}]){
  const denied={async execute(sql){return sql.includes("SELECT payload_digest")?[[changed]]:[{affectedRows:1}]}};
  await assert.rejects(()=>appendScopedChange(denied,{change:replayChange,sourceDeviceId}),/SYNC_IDEMPOTENCY_CONFLICT/);
 }
});

test("pull refuses corrupt, duplicate, unordered or unsafe journal IDs before cursor advancement",async()=>{
 const malformed=[
  [{id:8},{id:8}], // duplicate
  [{id:9},{id:8}], // out of order
  [{id:7}], // stale
  [{id:"9007199254740992"}], // unsafe BIGINT string
  [{id:"8.0"}], // noncanonical numeric text
  [{id:8},{id:9},{id:10}], // DB exceeded requested bound
  null // unexpected DB response
 ];
 for(const rows of malformed){
  const db={async execute(){return [rows]}};
  await assert.rejects(()=>pullScopedChanges(db,{tenantId:ids[1],branchId:ids[2],after:7,limit:2}),/SYNC_INVALID_JOURNAL_CURSOR/);
 }
 const db={async execute(){return [[{id:"8"},{id:9}]]}};
 const valid=await pullScopedChanges(db,{tenantId:ids[1],branchId:ids[2],after:7,limit:2});
 assert.equal(valid.nextCursor,9,"mysql2 BIGINT strings remain supported");
 assert.equal((await pullScopedChanges({async execute(){return [[]]}},{tenantId:ids[1],branchId:ids[2],after:7,limit:2})).nextCursor,7);
});

test("pull rejects non-string tenant and branch UUIDs before database access",async()=>{
 let calls=0;
 const db={async execute(){calls++;return [[]]}};
 const scope={tenantId:ids[1],branchId:ids[2]};
 for(const field of ["tenantId","branchId"]){
  for(const invalid of [[scope[field]],{toString(){return scope[field]}}]){
   await assert.rejects(()=>pullScopedChanges(db,{...scope,[field]:invalid}),/SYNC_INVALID_SCOPE/);
  }
 }
 assert.equal(calls,0,"invalid scopes must never reach SQL");
 assert.equal((await pullScopedChanges(db,scope)).nextCursor,0,"valid string UUID scope remains accepted");
 assert.equal(calls,1);
});
