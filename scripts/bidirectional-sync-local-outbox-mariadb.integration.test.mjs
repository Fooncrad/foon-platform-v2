// Opt-in MariaDB test of local business transaction -> outbox -> signed receipt.
// Uses TEMPORARY tables only; no application schema or production write.
import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import {generateKeyPairSync} from "node:crypto";
import {recordLocalBusinessChange} from "../lib/platform/bidirectional-sync-local-write.mjs";
import {readPendingSyncEvents} from "../lib/platform/bidirectional-sync-outbox.mjs";
import {persistVerifiedPushAcknowledgment} from "../lib/platform/bidirectional-sync-push-ack.mjs";
import {signCommittedPushReceipt} from "../lib/platform/bidirectional-sync-push-receipt.mjs";
import {digestChange} from "../lib/platform/bidirectional-sync-contract.mjs";

const url=process.env.FOON_SYNC_MARIADB_TEST_URL;
const deviceId="a30a493e-9809-4950-82bc-66d54b6c4ed1";
const change={eventId:"58c77291-c3b0-4d99-9abe-6b35eadd52b6",tenantId:"aba382f0-5ee0-418a-b25d-f69dc478c421",branchId:"cf3d29fb-d91f-4915-91da-eebaf38330c1",actorId:deviceId,entityType:"catalog_item",entityId:"9858af68-1560-45c2-a73f-2fdf1281b6f7",operation:"upsert",baseVersion:0,timestamp:"2026-10-23T00:00:00Z",payload:{name:"Local transaction test"}};
const scope={deviceId,tenantId:change.tenantId,branchId:change.branchId};
const expected={eventId:change.eventId,tenantId:change.tenantId,branchId:change.branchId,digest:digestChange(change)};
const keys=generateKeyPairSync("ed25519");
const publicKey=keys.publicKey.export({type:"spki",format:"pem"});
const receipt=signCommittedPushReceipt({privateKey:keys.privateKey.export({type:"pkcs8",format:"pem"}),receipt:{deviceId,...expected,status:"recorded",nextVersion:1}});
test("MariaDB local business change, outbox, signed ACK and replay safety",{skip:!url?"FOON_SYNC_MARIADB_TEST_URL is not configured":false,timeout:15000},async()=>{
 const db=await mysql.createConnection(url);
 try{
  await db.execute("CREATE TEMPORARY TABLE foon_sync_pending_events (device_id CHAR(36) NOT NULL,event_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,branch_id CHAR(36) NOT NULL,payload_digest CHAR(64) NOT NULL,event_payload JSON NOT NULL,queued_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),state ENUM('pending','conflict','acknowledged') NOT NULL DEFAULT 'pending',acknowledged_version BIGINT UNSIGNED NULL,PRIMARY KEY(device_id,event_id)) ENGINE=InnoDB");
  await db.execute("CREATE TEMPORARY TABLE foon_sync_push_acknowledgments (device_id CHAR(36) NOT NULL,event_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,branch_id CHAR(36) NOT NULL,payload_digest CHAR(64) NOT NULL,next_version BIGINT UNSIGNED NOT NULL,signature VARCHAR(128) NOT NULL,PRIMARY KEY(device_id,event_id)) ENGINE=InnoDB");
  await db.execute("CREATE TEMPORARY TABLE foon_sync_local_test_business (item_id CHAR(36) PRIMARY KEY,caption VARCHAR(80)) ENGINE=InnoDB");
  const apply=async(conn,event)=>{await conn.execute("INSERT INTO foon_sync_local_test_business(item_id,caption) VALUES (?,?)",[event.entityId,event.payload.name]);return true;};
  const businessCount=async()=>{const [[x]]=await db.execute("SELECT COUNT(*) AS n FROM foon_sync_local_test_business");return Number(x.n)};
  await assert.rejects(()=>recordLocalBusinessChange({db,change,deviceId,applyBusinessChange:async(conn,event)=>{await apply(conn,event);throw Error("LOCAL_FAIL")}}),/LOCAL_FAIL/);
  assert.equal(await businessCount(),0);
  assert.equal((await readPendingSyncEvents(db,{...scope})).length,0);
  assert.equal((await recordLocalBusinessChange({db,change,deviceId,applyBusinessChange:apply})).status,"queued");
  assert.equal(await businessCount(),1);
  assert.equal((await readPendingSyncEvents(db,{...scope})).length,1);
  let duplicateCalled=false;
  assert.equal((await recordLocalBusinessChange({db,change,deviceId,applyBusinessChange:async()=>{duplicateCalled=true;return true}})).status,"duplicate");
  assert.equal(duplicateCalled,false);
  assert.equal(await businessCount(),1);
  const tampered={...receipt,receipt:{...receipt.receipt,nextVersion:8}};
  await assert.rejects(()=>persistVerifiedPushAcknowledgment({db,payload:tampered,expected,deviceId,publicKey}),/SYNC_RECEIPT_SIGNATURE_INVALID/);
  assert.equal((await readPendingSyncEvents(db,{...scope})).length,1);
  assert.equal((await persistVerifiedPushAcknowledgment({db,payload:receipt,expected,deviceId,publicKey})).status,"acknowledged");
  assert.equal((await readPendingSyncEvents(db,{...scope})).length,0);
  assert.equal(await businessCount(),1);
  assert.equal((await persistVerifiedPushAcknowledgment({db,payload:receipt,expected,deviceId,publicKey})).status,"acknowledged");
  const [[ledger]]=await db.execute("SELECT COUNT(*) AS n FROM foon_sync_push_acknowledgments");
  assert.equal(Number(ledger.n),1);
 }finally{await db.end();}
});
