// Opt-in real MariaDB test for independently scoped pending events and offline retention.
// Only session-local TEMPORARY InnoDB tables; never run against production.
import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import {generateKeyPairSync} from "node:crypto";
import {digestChange} from "../lib/platform/bidirectional-sync-contract.mjs";
import {signCommittedPushReceipt} from "../lib/platform/bidirectional-sync-push-receipt.mjs";
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
  await db.execute("CREATE TEMPORARY TABLE foon_sync_pending_events (device_id CHAR(36) NOT NULL,event_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,branch_id CHAR(36) NOT NULL,payload_digest CHAR(64) NOT NULL,event_payload JSON NOT NULL,queued_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),state ENUM('pending','conflict','acknowledged') NOT NULL DEFAULT 'pending',acknowledged_version BIGINT UNSIGNED NULL,PRIMARY KEY(device_id,event_id)) ENGINE=InnoDB");
  await db.execute("CREATE TEMPORARY TABLE foon_sync_push_acknowledgments (device_id CHAR(36) NOT NULL,event_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,branch_id CHAR(36) NOT NULL,payload_digest CHAR(64) NOT NULL,next_version BIGINT UNSIGNED NOT NULL,signature VARCHAR(128) NOT NULL,PRIMARY KEY(device_id,event_id)) ENGINE=InnoDB");
  await db.beginTransaction();
  try{for(let i=0;i<scopes.length;i++)await enqueueScopedSyncEvent(db,{change:event(scopes[i],ids[i]),deviceId:scopes[i].deviceId});await db.commit();}
  catch(error){await db.rollback();throw error;}
  for(let i=0;i<scopes.length;i++){
   const pending=await readPendingSyncEvents(db,scopes[i]);
   assert.deepEqual(pending.map(x=>x.eventId),[ids[i]],"scope predicate must include device, tenant and branch");
  }
  // The push worker validates its pinned Ed25519 key before any network attempt.
  const offlinePublicKey=generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"});
  let attempts=0;
  await assert.rejects(()=>pushNextPendingSyncEvent({
   db,scope:scopes[0],url:"https://sync.example.com/api/sync/v1/push",
   authorization:"Bearer "+"x".repeat(64),publicKey:offlinePublicKey,
   fetchImpl:async()=>{attempts++;throw Error("SIMULATED_NETWORK_FAILURE");}
  }),/SIMULATED_NETWORK_FAILURE/);
  assert.equal(attempts,1);
  for(let i=0;i<scopes.length;i++)assert.deepEqual((await readPendingSyncEvents(db,scopes[i])).map(x=>x.eventId),[ids[i]]);
  const [[count]]=await db.execute("SELECT COUNT(*) AS total FROM foon_sync_pending_events WHERE state='pending'");
  assert.equal(Number(count.total),scopes.length);
  // A cloud commit can succeed while the response is lost in transit.
  // A signed duplicate on reconnect must ACK only the original scope.
  const kp=generateKeyPairSync("ed25519");
  const privateKey=kp.privateKey.export({type:"pkcs8",format:"pem"});
  const publicKey=kp.publicKey.export({type:"spki",format:"pem"});
  const first=event(scopes[0],ids[0]);
  const receipt=signCommittedPushReceipt({privateKey,receipt:{
   deviceId:deviceA,eventId:first.eventId,tenantId:tenantA,branchId:branchA,
   digest:digestChange(first),status:"duplicate",nextVersion:1
  }});
  const response=(data)=>({ok:true,status:200,redirected:false,headers:{get:()=>"application/json"},json:async()=>data});
  const options={db,scope:scopes[0],url:"https://sync.example.com/api/sync/v1/push",authorization:"Bearer "+"x".repeat(64),publicKey};
  const corrupted={...receipt,receipt:{...receipt.receipt,signature:"a".repeat(86)}};
  await assert.rejects(()=>pushNextPendingSyncEvent({...options,fetchImpl:async()=>response(corrupted)}),/SYNC_.*SIGNATURE/);
  assert.equal((await readPendingSyncEvents(db,scopes[0])).length,1,"invalid signature must preserve the pending event");
  const resumed=await pushNextPendingSyncEvent({...options,fetchImpl:async()=>response(receipt)});
  assert.deepEqual(resumed,{status:"acknowledged",eventId:ids[0]});
  assert.deepEqual(await readPendingSyncEvents(db,scopes[0]),[]);
  for(let i=1;i<scopes.length;i++)assert.deepEqual((await readPendingSyncEvents(db,scopes[i])).map(x=>x.eventId),[ids[i]]);
  const [[ackCount]]=await db.execute("SELECT COUNT(*) AS n FROM foon_sync_push_acknowledgments");
  assert.equal(Number(ackCount.n),1,"one durable ACK only");
  const idle=await pushNextPendingSyncEvent({...options,fetchImpl:async()=>{throw Error("ALREADY_ACKED_MUST_NOT_REPOST")}});
  assert.deepEqual(idle,{status:"idle"});
  // Simulate a previously signed conflict followed by a dependent queued edit.
  const conflictId="66666666-6666-4666-8666-666666666666";
  const laterId="77777777-7777-4777-8777-777777777777";
  await db.beginTransaction();
  try{
   await enqueueScopedSyncEvent(db,{change:event(scopes[0],conflictId),deviceId:deviceA});
   await enqueueScopedSyncEvent(db,{change:event(scopes[0],laterId),deviceId:deviceA});
   await db.commit();
  }catch(error){await db.rollback();throw error;}
  await db.execute("UPDATE foon_sync_pending_events SET state='conflict' WHERE device_id=? AND event_id=?",[deviceA,conflictId]);
  await assert.rejects(()=>readPendingSyncEvents(db,scopes[0]),/SYNC_CONFLICT_REVIEW_REQUIRED/);
  let unexpectedSends=0;
  await assert.rejects(()=>pushNextPendingSyncEvent({...options,fetchImpl:async()=>{unexpectedSends++;return response(receipt)}}),/SYNC_CONFLICT_REVIEW_REQUIRED/);
  assert.equal(unexpectedSends,0,"later events must not bypass an unresolved conflict");
  for(let i=1;i<scopes.length;i++)assert.deepEqual((await readPendingSyncEvents(db,scopes[i])).map(x=>x.eventId),[ids[i]]);
 }finally{await db.end();}
});
