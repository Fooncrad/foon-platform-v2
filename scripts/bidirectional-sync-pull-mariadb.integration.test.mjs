// Opt-in MariaDB test of signed pull application and cursor atomicity.
// TEMPORARY tables shadow production names only on this disposable connection.
import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import {generateKeyPairSync,sign} from "node:crypto";
import {applyVerifiedPullBatch} from "../lib/platform/bidirectional-sync-local-receiver.mjs";
import {pullBatchSignatureMessage} from "../lib/platform/bidirectional-sync-signature.mjs";
import {digestChange} from "../lib/platform/bidirectional-sync-contract.mjs";

const url=process.env.FOON_SYNC_MARIADB_TEST_URL;
const scope={deviceId:"a30a493e-9809-4950-82bc-66d54b6c4ed1",tenantId:"aba382f0-5ee0-418a-b25d-f69dc478c421",branchId:"cf3d29fb-d91f-4915-91da-eebaf38330c1",after:0,limit:10};
const kp=generateKeyPairSync("ed25519");
const publicKey=kp.publicKey.export({type:"spki",format:"pem"});
const eventId="58c77291-c3b0-4d99-9abe-6b35eadd52b6";
const remoteDeviceId="c30a493e-9809-4950-82bc-66d54b6c4ed1";
function signed(id,{sourceDeviceId=remoteDeviceId,idOverride=eventId,after=scope.after}={}){
 const change={eventId:idOverride,tenantId:scope.tenantId,branchId:scope.branchId,actorId:scope.deviceId,entityType:"catalog_item",entityId:eventId,operation:"upsert",baseVersion:0,timestamp:"2026-10-23T00:00:00Z",payload:{name:"Isolation probe"}};
 const event={id,event_id:change.eventId,tenant_id:change.tenantId,branch_id:change.branchId,actor_id:change.actorId,source_device_id:sourceDeviceId,entity_type:change.entityType,entity_id:change.entityId,operation:change.operation,base_version:0,next_version:1,event_timestamp:change.timestamp,payload_json:change.payload,payload_digest:digestChange(change)};
 const batch={ok:true,tenantId:scope.tenantId,branchId:scope.branchId,events:[event],nextCursor:id};
 return {batch,signature:sign(null,pullBatchSignatureMessage(batch,{...scope,after}),kp.privateKey).toString("base64url")};
}
test("real MariaDB signed pull and cursor commit or rollback together",{skip:!url?"FOON_SYNC_MARIADB_TEST_URL is not configured":false,timeout:15000},async()=>{
 const db=await mysql.createConnection(url);
 try{
  await db.execute("CREATE TEMPORARY TABLE foon_sync_device_cursors (device_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,branch_id CHAR(36) NOT NULL,last_pulled_id BIGINT UNSIGNED NOT NULL,PRIMARY KEY(device_id,tenant_id,branch_id)) ENGINE=InnoDB");
  await db.execute("CREATE TEMPORARY TABLE foon_sync_pull_test_projection (event_id CHAR(36) PRIMARY KEY,description VARCHAR(100) NOT NULL) ENGINE=InnoDB");
  await db.execute("CREATE TEMPORARY TABLE foon_sync_pending_events (device_id CHAR(36) NOT NULL,event_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,branch_id CHAR(36) NOT NULL,payload_digest CHAR(64) NOT NULL,event_payload JSON NOT NULL,PRIMARY KEY(device_id,event_id)) ENGINE=InnoDB");
  await db.execute("INSERT INTO foon_sync_device_cursors(device_id,tenant_id,branch_id,last_pulled_id) VALUES (?,?,?,0)",[scope.deviceId,scope.tenantId,scope.branchId]);
  const applyEvent=async(conn,event)=>{await conn.execute("INSERT INTO foon_sync_pull_test_projection(event_id,description) VALUES (?,?)",[event.event_id,"applied"]);return true;};
  const packet=signed(1);
  await assert.rejects(()=>applyVerifiedPullBatch({db,...packet,scope,publicKey,applyEvent:async(conn,event)=>{await applyEvent(conn,event);throw Error("PROJECTION_FAILURE")}}),/PROJECTION_FAILURE/);
  let [[cursor]]=await db.execute("SELECT last_pulled_id FROM foon_sync_device_cursors WHERE device_id=? AND tenant_id=? AND branch_id=?",[scope.deviceId,scope.tenantId,scope.branchId]);
  let [[count]]=await db.execute("SELECT COUNT(*) AS total FROM foon_sync_pull_test_projection");
  assert.equal(Number(cursor.last_pulled_id),0);
  assert.equal(count.total,0);
  const applied=await applyVerifiedPullBatch({db,...packet,scope,publicKey,applyEvent});
  assert.equal(applied.nextCursor,1);
  [[cursor]]=await db.execute("SELECT last_pulled_id FROM foon_sync_device_cursors WHERE device_id=? AND tenant_id=? AND branch_id=?",[scope.deviceId,scope.tenantId,scope.branchId]);
  [[count]]=await db.execute("SELECT COUNT(*) AS total FROM foon_sync_pull_test_projection");
  assert.equal(Number(cursor.last_pulled_id),1);
  assert.equal(count.total,1);
  await assert.rejects(()=>applyVerifiedPullBatch({db,...packet,scope,publicKey,applyEvent}),/SYNC_CURSOR_CONFLICT/);
  [[count]]=await db.execute("SELECT COUNT(*) AS total FROM foon_sync_pull_test_projection");
  assert.equal(count.total,1);
  // Cloud echo of a locally committed event must advance the cursor without
  // inserting into the business projection a second time.
  const echoScope={...scope,after:1};
  const echo=signed(2,{sourceDeviceId:scope.deviceId,idOverride:"68c77291-c3b0-4d99-9abe-6b35eadd52b6",after:1});
  await assert.rejects(()=>applyVerifiedPullBatch({db,...echo,scope:echoScope,publicKey,applyEvent}),/SYNC_LOCAL_ECHO_UNPROVEN/);
  [[cursor]]=await db.execute("SELECT last_pulled_id FROM foon_sync_device_cursors WHERE device_id=? AND tenant_id=? AND branch_id=?",[scope.deviceId,scope.tenantId,scope.branchId]);
  assert.equal(Number(cursor.last_pulled_id),1,"unproven local echo must not advance cursor");
  const own=echo.batch.events[0];
  const ownChange={eventId:own.event_id,tenantId:own.tenant_id,branchId:own.branch_id,actorId:own.actor_id,entityType:own.entity_type,entityId:own.entity_id,operation:own.operation,baseVersion:own.base_version,timestamp:own.event_timestamp,payload:own.payload_json};
  // The local outbox is durable proof that this device already committed the
  // mutation. Without it, skipping a cloud echo after backup restore is unsafe.
  await db.execute("INSERT INTO foon_sync_pending_events(device_id,event_id,tenant_id,branch_id,payload_digest,event_payload) VALUES (?,?,?,?,?,?)",[scope.deviceId,own.event_id,scope.tenantId,scope.branchId,own.payload_digest,JSON.stringify(ownChange)]);
  const echoed=await applyVerifiedPullBatch({db,...echo,scope:echoScope,publicKey,applyEvent});
  assert.equal(echoed.count,0);
  assert.equal(echoed.nextCursor,2);
  [[cursor]]=await db.execute("SELECT last_pulled_id FROM foon_sync_device_cursors WHERE device_id=? AND tenant_id=? AND branch_id=?",[scope.deviceId,scope.tenantId,scope.branchId]);
  [[count]]=await db.execute("SELECT COUNT(*) AS total FROM foon_sync_pull_test_projection");
  assert.equal(Number(cursor.last_pulled_id),2);
  assert.equal(Number(count.total),1);
 }finally{await db.end();}
});
