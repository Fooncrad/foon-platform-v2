// Opt-in real MariaDB test for independently scoped pending events and offline retention.
// Only session-local TEMPORARY InnoDB tables; never run against production.
import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import {enqueueScopedSyncEvent,readPendingSyncEvents} from "../lib/platform/bidirectional-sync-outbox.mjs";
import {pushNextPendingSyncEvent} from "../lib/platform/bidirectional-sync-push-worker.mjs";

const url=process.env.FOON_SYNC_MARIADB_TEST_URL;
const deviceA="a30a493e-9809-4950-82bc-66d54b6c4ed1",deviceB="b30a493e-9809-4950-82bc-66d54b6c4ed1";
const tenantA="aba382f0-5ee0-418a-b25d-f69dc478c421",tenantB="bba382f0-5ee0-418a-b25d-f69dc478c421";
const branchA="cf3d29fb-d91f-4915-91da-eebaf38330c1",branchB="df3d29fb-d91f-4915-91da-eebaf38330c1";
const scopes=[
 {deviceId:deviceA,tenantId:tenantA,branchId:branchA},
 {deviceId:deviceB,tenantId:tenantB,branchId:branchB},
 {deviceId:deviceA,tenantId:tenantB,branchId:branchA}, // tenant predicate
 {deviceId:deviceA,tenantId:tenantA,branchId:branchB}, // branch predicate
 {deviceId:deviceB,tenantId:tenantA,branchId:branchA}  // device predicate
];
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555"];
function event(scope,id){return {eventId:id,tenantId:scope.tenantId,branchId:scope.branchId,actorId:scope.deviceId,entityType:"order",entityId:id,operation:"upsert",baseVersion:0,timestamp:"2026-10-23T00:00:00Z",payload:{status:"pending"}};}
test("MariaDB outbox isolates device, tenant, branch and survives network failure",{skip:!url?"FOON_SYNC_MARIADB_TEST_URL is not configured":false,timeout:15000},async()=>{
 const db=await mysql.createConnection(url);
 try{
  await db.execute("CREATE TEMPORARY TABLE foon_sync_pending_events (device_id CHAR(36) NOT NULL,event_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,branch_id CHAR(36) NOT NULL,payload_digest CHAR(64) NOT NULL,event_payload JSON NOT NULL,queued_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),state ENUM('pending','conflict','acknowledged') NOT NULL DEFAULT 'pending',PRIMARY KEY(device_id,event_id)) ENGINE=InnoDB");
  await db.beginTransaction();
  try{for(let i=0;i<scopes.length;i++)await enqueueScopedSyncEvent(db,{change:event(scopes[i],ids[i]),deviceId:scopes[i].deviceId});await db.commit();}
  catch(error){await db.rollback();throw error;}
  for(let i=0;i<scopes.length;i++){
   const pending=await readPendingSyncEvents(db,scopes[i]);
   assert.deepEqual(pending.map(x=>x.eventId),[ids[i]],"scope predicate must include device, tenant and branch");
  }
  let attempts=0;
  await assert.rejects(()=>pushNextPendingSyncEvent({
   db,scope:scopes[0],url:"https://sync.example.com/api/sync/v1/push",
   authorization:"Bearer "+"x".repeat(64),publicKey:"unused-on-network-error",
   fetchImpl:async()=>{attempts++;throw Error("SIMULATED_NETWORK_FAILURE");}
  }),/SIMULATED_NETWORK_FAILURE/);
  assert.equal(attempts,1);
  for(let i=0;i<scopes.length;i++)assert.deepEqual((await readPendingSyncEvents(db,scopes[i])).map(x=>x.eventId),[ids[i]]);
  const [[count]]=await db.execute("SELECT COUNT(*) AS total FROM foon_sync_pending_events WHERE state='pending'");
  assert.equal(Number(count.total),scopes.length);
 }finally{await db.end();}
});
