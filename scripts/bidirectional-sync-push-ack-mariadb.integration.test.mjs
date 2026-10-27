// Opt-in real MariaDB signed push ACK transaction test.
// Creates only session TEMPORARY InnoDB tables in the disposable test DB.
import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import {generateKeyPairSync} from "node:crypto";
import {persistVerifiedPushAcknowledgment} from "../lib/platform/bidirectional-sync-push-ack.mjs";
import {signCommittedPushReceipt} from "../lib/platform/bidirectional-sync-push-receipt.mjs";

const url=process.env.FOON_SYNC_MARIADB_TEST_URL;
const ids={deviceId:"a30a493e-9809-4950-82bc-66d54b6c4ed1",tenantId:"aba382f0-5ee0-418a-b25d-f69dc478c421",branchId:"cf3d29fb-d91f-4915-91da-eebaf38330c1",eventId:"58c77291-c3b0-4d99-9abe-6b35eadd52b6"};
const digest="b".repeat(64);
const expected={eventId:ids.eventId,tenantId:ids.tenantId,branchId:ids.branchId,digest};
const keys=generateKeyPairSync("ed25519");
const privateKey=keys.privateKey.export({format:"pem",type:"pkcs8"});
const publicKey=keys.publicKey.export({format:"pem",type:"spki"});
const makeReceipt=(status="recorded",nextVersion=1)=>signCommittedPushReceipt({privateKey,receipt:{...ids,digest,status,nextVersion}});
test("real MariaDB signed push receipt commits ACK and queue state atomically",{skip:!url?"FOON_SYNC_MARIADB_TEST_URL is not configured":false,timeout:15000},async()=>{
 const db=await mysql.createConnection(url);
 try{
  await db.execute("CREATE TEMPORARY TABLE foon_sync_pending_events (device_id CHAR(36) NOT NULL,event_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,branch_id CHAR(36) NOT NULL,payload_digest CHAR(64) NOT NULL,state ENUM('pending','conflict','acknowledged') NOT NULL DEFAULT 'pending',acknowledged_version BIGINT UNSIGNED NULL,PRIMARY KEY(device_id,event_id)) ENGINE=InnoDB");
  await db.execute("CREATE TEMPORARY TABLE foon_sync_push_acknowledgments (device_id CHAR(36) NOT NULL,event_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,branch_id CHAR(36) NOT NULL,payload_digest CHAR(64) NOT NULL,next_version BIGINT UNSIGNED NOT NULL,signature VARCHAR(128) NOT NULL,PRIMARY KEY(device_id,event_id)) ENGINE=InnoDB");
  const insert=async(eventId)=>db.execute("INSERT INTO foon_sync_pending_events(device_id,event_id,tenant_id,branch_id,payload_digest,state) VALUES (?,?,?,?,?,'pending')",[ids.deviceId,eventId,ids.tenantId,ids.branchId,digest]);
  const state=async(eventId)=>{const [[row]]=await db.execute("SELECT state,acknowledged_version FROM foon_sync_pending_events WHERE device_id=? AND event_id=?",[ids.deviceId,eventId]);return row;};
  const count=async()=>{const [[row]]=await db.execute("SELECT COUNT(*) AS n FROM foon_sync_push_acknowledgments");return Number(row.n);};
  await insert(ids.eventId);
  const valid=makeReceipt();
  const invalid={...valid,receipt:{...valid.receipt,nextVersion:2}};
  await assert.rejects(()=>persistVerifiedPushAcknowledgment({db,payload:invalid,expected,deviceId:ids.deviceId,publicKey}),/SYNC_RECEIPT_SIGNATURE_INVALID/);
  assert.equal((await state(ids.eventId)).state,"pending");
  assert.equal(await count(),0);
  // Trigger failure after the ACK row insert: the queue update cannot match.
  // This uses the same production transaction code, but a test-only connection
  // adapter to fail just the second statement (without persisting any fake data).
  const proxy={
   beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),
   execute:(sql,params)=>sql.startsWith("UPDATE foon_sync_pending_events SET state='acknowledged'")?Promise.resolve([{affectedRows:0}]):db.execute(sql,params)
  };
  await assert.rejects(()=>persistVerifiedPushAcknowledgment({db:proxy,payload:valid,expected,deviceId:ids.deviceId,publicKey}),/SYNC_OUTBOX_ACK_UPDATE_FAILED/);
  assert.equal((await state(ids.eventId)).state,"pending");
  assert.equal(await count(),0);
  assert.equal((await persistVerifiedPushAcknowledgment({db,payload:valid,expected,deviceId:ids.deviceId,publicKey})).status,"acknowledged");
  assert.equal((await state(ids.eventId)).state,"acknowledged");
  assert.equal(Number((await state(ids.eventId)).acknowledged_version),1);
  assert.equal(await count(),1);
  assert.equal((await persistVerifiedPushAcknowledgment({db,payload:valid,expected,deviceId:ids.deviceId,publicKey})).status,"acknowledged");
  assert.equal(await count(),1);
  const conflictId="9858af68-1560-45c2-a73f-2fdf1281b6f7";
  await insert(conflictId);
  const conflictExpected={...expected,eventId:conflictId};
  const conflict=signCommittedPushReceipt({privateKey,receipt:{...ids,eventId:conflictId,digest,status:"conflict",nextVersion:0}});
  assert.equal((await persistVerifiedPushAcknowledgment({db,payload:conflict,expected:conflictExpected,deviceId:ids.deviceId,publicKey})).status,"conflict");
  assert.equal((await state(conflictId)).state,"conflict");
  assert.equal(await count(),1);
 }finally{await db.end();}
});
