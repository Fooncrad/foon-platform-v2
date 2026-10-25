import test from "node:test";
import assert from "node:assert/strict";
import {pushWithMariaDbDeviceLock} from "../lib/platform/bidirectional-sync-mariadb-lock.mjs";
const scope={deviceId:"11111111-1111-4111-8111-111111111111",tenantId:"22222222-2222-4222-8222-222222222222",branchId:"33333333-3333-4333-8333-333333333333"};
function fixture({grant=1,failRead=false,failAcquire=false,releaseValue=1}={}){
 const calls=[];
 const db={async execute(sql,args){calls.push({sql,args});if(sql.startsWith("SELECT GET_LOCK")&&failAcquire)throw Error("LOCK_QUERY_FAILED");if(sql.startsWith("SELECT GET_LOCK"))return [[{acquired:grant}]];if(sql.startsWith("SELECT RELEASE_LOCK"))return [[{released:releaseValue}]];if(sql.startsWith("SELECT event_id")){if(failRead&&!sql.includes("state='conflict'"))throw Error("READ_FAILED");return [[]]}throw Error("UNEXPECTED_SQL")},release(){calls.push({sql:"release"})},destroy(){calls.push({sql:"destroy"})}};
 return {pool:{async getConnection(){calls.push({sql:"connection"});return db}},calls};
}
test("cross-process advisory lock held until bounded pass completes",async()=>{
 const x=fixture();const result=await pushWithMariaDbDeviceLock({pool:x.pool,scope,maxEvents:1});
 assert.equal(result.status,"idle");
 assert.deepEqual(x.calls.map(c=>c.sql),["connection","SELECT GET_LOCK(?,0) AS acquired","SELECT event_id FROM foon_sync_pending_events WHERE device_id=? AND tenant_id=? AND branch_id=? AND state='conflict' LIMIT 1","SELECT event_id,payload_digest,event_payload FROM foon_sync_pending_events WHERE device_id=? AND tenant_id=? AND branch_id=? AND state='pending' ORDER BY queued_at ASC,event_id ASC LIMIT ?","SELECT RELEASE_LOCK(?) AS released","release"]);
 assert.equal(x.calls[1].args[0],x.calls[4].args[0]);
});
test("busy lock stops before touching outbox",async()=>{
 const x=fixture({grant:0});
 await assert.rejects(()=>pushWithMariaDbDeviceLock({pool:x.pool,scope}),/SYNC_PUSH_ALREADY_RUNNING/);
 assert.deepEqual(x.calls.map(c=>c.sql),["connection","SELECT GET_LOCK(?,0) AS acquired","release"]);
});
test("worker failure releases advisory lock and connection",async()=>{
 const x=fixture({failRead:true});
 await assert.rejects(()=>pushWithMariaDbDeviceLock({pool:x.pool,scope}),/READ_FAILED/);
 assert.equal(x.calls.at(-2).sql,"SELECT RELEASE_LOCK(?) AS released");
 assert.equal(x.calls.at(-1).sql,"release");
});

test("uncertain GET_LOCK response destroys connection instead of pooling it",async()=>{
 const x=fixture({failAcquire:true});
 await assert.rejects(()=>pushWithMariaDbDeviceLock({pool:x.pool,scope}),/LOCK_QUERY_FAILED/);
 assert.equal(x.calls.at(-1).sql,"destroy");
 assert.equal(x.calls.some(c=>c.sql==="release"),false);
});
test("failed RELEASE_LOCK destroys connection and rejects success",async()=>{
 const x=fixture({releaseValue:0});
 await assert.rejects(()=>pushWithMariaDbDeviceLock({pool:x.pool,scope,maxEvents:1}),/SYNC_LOCK_RELEASE_FAILED/);
 assert.equal(x.calls.at(-1).sql,"destroy");
});

test("mixed-case UUID spellings use the same MariaDB advisory lock name",async()=>{
 const lower=fixture({grant:0});
 const upper=fixture({grant:0});
 const upperScope=Object.fromEntries(Object.entries(scope).map(([key,id])=>[key,id.toUpperCase()]));
 await assert.rejects(()=>pushWithMariaDbDeviceLock({pool:lower.pool,scope}),/SYNC_PUSH_ALREADY_RUNNING/);
 await assert.rejects(()=>pushWithMariaDbDeviceLock({pool:upper.pool,scope:upperScope}),/SYNC_PUSH_ALREADY_RUNNING/);
 assert.equal(lower.calls[1].args[0],upper.calls[1].args[0],"cross-process locks must not diverge by UUID letter case");
 assert.equal(lower.calls.at(-1).sql,"release");
 assert.equal(upper.calls.at(-1).sql,"release");
});

test("malformed GET_LOCK results destroy the session before any push",async()=>{
 for(const grant of [null,false,true,[],[1],{valueOf:()=>1},"1e0"," 1 ",""]){
  const x=fixture({grant});
  await assert.rejects(()=>pushWithMariaDbDeviceLock({pool:x.pool,scope,maxEvents:1}),/SYNC_LOCK_STATE_UNKNOWN/);
  assert.deepEqual(x.calls.map(c=>c.sql),["connection","SELECT GET_LOCK(?,0) AS acquired","destroy"]);
 }
});
test("malformed RELEASE_LOCK results never return an uncertain session to the pool",async()=>{
 for(const releaseValue of [null,false,true,[],[1],{valueOf:()=>1},"1e0"," 1 ",""]){
  const x=fixture({releaseValue});
  await assert.rejects(()=>pushWithMariaDbDeviceLock({pool:x.pool,scope,maxEvents:1}),/SYNC_LOCK_RELEASE_FAILED/);
  assert.equal(x.calls.at(-1).sql,"destroy");
  assert.equal(x.calls.some(c=>c.sql==="release"),false);
 }
});
test("canonical MariaDB string lock results retain normal busy and success behavior",async()=>{
 const acquired=fixture({grant:"1",releaseValue:"1"});
 assert.equal((await pushWithMariaDbDeviceLock({pool:acquired.pool,scope,maxEvents:1})).status,"idle");
 assert.equal(acquired.calls.at(-1).sql,"release");
 const busy=fixture({grant:"0"});
 await assert.rejects(()=>pushWithMariaDbDeviceLock({pool:busy.pool,scope}),/SYNC_PUSH_ALREADY_RUNNING/);
 assert.equal(busy.calls.at(-1).sql,"release");
});

test("caller cannot override the MariaDB connection protected by the advisory lock",async()=>{
 const x=fixture();
 const foreignDb={async execute(){throw Error("BYPASS_CONNECTION_USED");}};
 const result=await pushWithMariaDbDeviceLock({pool:x.pool,scope,db:foreignDb,maxEvents:1});
 assert.equal(result.status,"idle");
 assert.equal(x.calls.filter(c=>c.sql==="SELECT RELEASE_LOCK(?) AS released").length,1);
 assert.equal(x.calls.at(-1).sql,"release");
});
