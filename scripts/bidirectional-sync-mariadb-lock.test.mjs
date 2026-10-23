import test from "node:test";
import assert from "node:assert/strict";
import {pushWithMariaDbDeviceLock} from "../lib/platform/bidirectional-sync-mariadb-lock.mjs";
const scope={deviceId:"11111111-1111-4111-8111-111111111111",tenantId:"22222222-2222-4222-8222-222222222222",branchId:"33333333-3333-4333-8333-333333333333"};
function fixture({grant=1,failRead=false,failAcquire=false,releaseValue=1}={}){
 const calls=[];
 const db={async execute(sql,args){calls.push({sql,args});if(sql.startsWith("SELECT GET_LOCK")&&failAcquire)throw Error("LOCK_QUERY_FAILED");if(sql.startsWith("SELECT GET_LOCK"))return [[{acquired:grant}]];if(sql.startsWith("SELECT RELEASE_LOCK"))return [[{released:releaseValue}]];if(sql.startsWith("SELECT event_id")){if(failRead)throw Error("READ_FAILED");return [[]]}throw Error("UNEXPECTED_SQL")},release(){calls.push({sql:"release"})},destroy(){calls.push({sql:"destroy"})}};
 return {pool:{async getConnection(){calls.push({sql:"connection"});return db}},calls};
}
test("cross-process advisory lock held until bounded pass completes",async()=>{
 const x=fixture();const result=await pushWithMariaDbDeviceLock({pool:x.pool,scope,maxEvents:1});
 assert.equal(result.status,"idle");
 assert.deepEqual(x.calls.map(c=>c.sql),["connection","SELECT GET_LOCK(?,0) AS acquired","SELECT event_id,payload_digest,event_payload FROM foon_sync_pending_events WHERE device_id=? AND tenant_id=? AND branch_id=? AND state='pending' ORDER BY queued_at ASC,event_id ASC LIMIT ?","SELECT RELEASE_LOCK(?) AS released","release"]);
 assert.equal(x.calls[1].args[0],x.calls[3].args[0]);
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
