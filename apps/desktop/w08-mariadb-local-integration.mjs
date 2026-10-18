// W08: a one-time, local MariaDB persistence fixture, NOT the full platform
// migration. Writes only two known tables inside an initially empty
// foon_edge_test database; leaves fixtures in place for manual inspection.
// No DROP, cleanup, SQLite access, HTTP, production credentials or cloud calls.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomBytes,randomUUID} from "node:crypto";
import mysql from "mysql2/promise";
import {mysqlEdgeInboxAdapter} from "../../lib/platform/edge-sync-mysql-adapter.mjs";
import {acceptAndSignEdgeEvent} from "../../lib/platform/edge-sync-service.mjs";
import {verifyCloudReceiptSignature} from "../../lib/platform/edge-sync-receipt-signature.mjs";
import {eventDigest,validateCloudReceipt} from "../../scripts/foon-edge-sync-contract.mjs";
import {stage2LocalUrl,checkStage2Identity,stage2InboxCreateSql,STAGE2_ORDERS_SCHEMA} from "./w08-mariadb-stage2-safety.mjs";

let step="LOCAL_SAFETY";
let connection,pool,ddlStarted=false;
function must(condition,code){if(!condition)throw Error(code);}
function eventFor(identity,seq,orderId,quantity=1,extra={}){
  const payload={id:orderId,branchId:identity.branchId,items:[{id:randomUUID(),quantity}],...extra};
  const event={...identity,eventSeq:seq,kind:"created",orderId,payload};
  return {...event,digest:eventDigest({seq,order_id:orderId,kind:"created",payload})};
}
async function count(table,where,params){
  const [[row]]=await pool.execute("SELECT COUNT(*) AS total FROM "+table+" WHERE "+where,params);
  return Number(row.total);
}

async function main(){
  // Parse and reject unsafe targets before a database connection.
  const url=stage2LocalUrl(process.env.EDGE_TEST_DATABASE_URL);
  step="READ_ONLY_TARGET_CHECK";
  connection=await mysql.createConnection({uri:url,connectTimeout:5000,multipleStatements:false});
  const [[identity]]=await connection.query("SELECT DATABASE() AS dbname, @@port AS server_port, CURRENT_USER() AS account");
  const [grants]=await connection.query("SHOW GRANTS");
  const [tables]=await connection.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? LIMIT 1",["foon_edge_test"]);
  const audit=checkStage2Identity(identity,grants,tables);
  const migrationText=await readFile("migrations/0073_edge_sync_inbox.sql","utf8");
  const createInbox=stage2InboxCreateSql(migrationText);
  console.log("W08 STAGE 2 TARGET VERIFIED: localhost:3306 / foon_edge_test (initially empty)");
  if(audit.publicFixtureGrants)console.log("NOTICE: inherited MariaDB PUBLIC test grants detected; no other database will be used");

  step="CREATE_LOCAL_TEST_TABLES";
  ddlStarted=true;
  await connection.query(createInbox);
  await connection.query(STAGE2_ORDERS_SCHEMA);
  console.log("W08 LOCAL FIXTURES CREATED: edge_sync_inbox, w08_fixture_orders");
  await connection.end();
  connection=null;

  pool=mysql.createPool({uri:url,connectionLimit:5,waitForConnections:true});
  const signatureKey=randomBytes(48).toString("hex");
  const primary={tenantId:randomUUID(),branchId:randomUUID(),deviceId:randomUUID()};
  const orderId=randomUUID(),firstEvent=eventFor(primary,1,orderId);
  let injectedFailure=false;
  const adapter=mysqlEdgeInboxAdapter(pool,async(db,e)=>{
    if(injectedFailure)throw Error("W08_SIMULATED_BUSINESS_WRITE_FAILURE");
    await db.execute(
      "INSERT INTO w08_fixture_orders (order_id,tenant_id,branch_id,device_id,event_seq,item_count) VALUES (?,?,?,?,?,?)",
      [e.orderId,e.tenantId,e.branchId,e.deviceId,e.eventSeq,e.payload.items.reduce((s,i)=>s+i.quantity,0)]
    );
  });
  const receive=(e,id=primary)=>acceptAndSignEdgeEvent(e,id,adapter,signatureKey);

  step="DURABLE_RECEIPT_AND_REPLAY";
  const first=await receive(firstEvent);
  assert.equal(first.status,201);
  must(verifyCloudReceiptSignature(first.receipt,signatureKey),"W08_BAD_FIRST_SIGNATURE");
  must(validateCloudReceipt({seq:1,order_id:orderId,kind:"created",payload:firstEvent.payload},first.receipt,primary.deviceId),"W08_BAD_FIRST_RECEIPT");
  const replay=await receive(firstEvent);
  assert.equal(replay.status,200);
  assert.deepEqual(replay.receipt,first.receipt);
  assert.equal(await count("w08_fixture_orders","order_id=?",[orderId]),1);
  assert.equal(await count("edge_sync_inbox","device_id=? AND event_seq=?",[primary.deviceId,1]),1);
  console.log("PASS: durable signed receipt, repeat ACK and exactly-once business row");

  step="CONFLICT_AND_SCOPE";
  const conflicting=eventFor(primary,1,orderId,2);
  assert.equal((await receive(conflicting)).status,409);
  assert.equal((await receive({...firstEvent,tenantId:randomUUID()})).status,403);
  assert.equal((await receive({...firstEvent,branchId:randomUUID()})).status,403);
  assert.equal(await count("w08_fixture_orders","order_id=?",[orderId]),1);
  console.log("PASS: digest conflict and cross-scope event rejected");

  step="CONCURRENT_RETRY";
  const concurrentOrder=randomUUID(),concurrentEvent=eventFor(primary,2,concurrentOrder);
  const results=await Promise.all(Array.from({length:4},()=>receive(concurrentEvent)));
  assert.equal(results.filter(r=>r.status===201).length,1);
  assert.equal(results.filter(r=>r.status===200).length,3);
  assert.equal(new Set(results.map(r=>r.receipt.receiptId)).size,1);
  assert.equal(await count("w08_fixture_orders","order_id=?",[concurrentOrder]),1);
  console.log("PASS: four concurrent retries produce one durable order");

  step="ATOMIC_ROLLBACK";
  const failedOrder=randomUUID(),failedEvent=eventFor(primary,3,failedOrder);
  injectedFailure=true;
  try{await assert.rejects(receive(failedEvent),/W08_SIMULATED_BUSINESS_WRITE_FAILURE/);}
  finally{injectedFailure=false;}
  assert.equal(await count("w08_fixture_orders","order_id=?",[failedOrder]),0);
  assert.equal(await count("edge_sync_inbox","device_id=? AND event_seq=?",[primary.deviceId,3]),0);
  assert.equal((await receive(failedEvent)).status,201);
  assert.equal(await count("w08_fixture_orders","order_id=?",[failedOrder]),1);
  console.log("PASS: failed business write rolls back inbox, successful retry commits");

  step="TENANT_BRANCH_DEVICE_ISOLATION";
  const secondary={tenantId:randomUUID(),branchId:randomUUID(),deviceId:randomUUID()};
  const isolatedOrder=randomUUID(),isolatedEvent=eventFor(secondary,1,isolatedOrder);
  const isolated=await receive(isolatedEvent,secondary);
  assert.equal(isolated.status,201);
  assert.equal(await count("w08_fixture_orders","tenant_id=? AND branch_id=?",[secondary.tenantId,secondary.branchId]),1);
  assert.equal(await count("w08_fixture_orders","tenant_id=? AND branch_id=?",[primary.tenantId,primary.branchId]),3);
  assert.equal(await count("edge_sync_inbox","device_id=? AND event_seq=?",[secondary.deviceId,1]),1);
  must(verifyCloudReceiptSignature(isolated.receipt,signatureKey),"W08_BAD_ISOLATED_SIGNATURE");
  console.log("PASS: two distinct synthetic tenant/branch/device scopes");

  step="FINAL_COUNTS";
  assert.equal(await count("edge_sync_inbox","1=1",[]),4);
  assert.equal(await count("w08_fixture_orders","1=1",[]),4);
  console.log("W08 LOCAL MARIADB INTEGRATION PASSED");
  console.log("TEST DATA: 4 synthetic inbox events, 4 synthetic order rows in foon_edge_test");
  console.log("TWO TEST TABLES RETAINED FOR INSPECTION; NO DROP OR CLEANUP PERFORMED");
  console.log("NO REAL CLOUD SYNC, FULL PLATFORM MIGRATIONS, OR SQLITE DATA ACCESSED");
}

try{
  await main();
}catch(error){
  // Never reveal driver messages; connection strings may include passwords.
  const known=String(error?.message??"").startsWith("W08_")?String(error.message):"W08_STAGE2_TEST_OR_SQL_FAILURE";
  console.error("W08 STAGE 2 STOPPED AT "+step+": "+known);
  if(ddlStarted)console.error("TEST TABLES MAY REMAIN. DO NOT RESET DATABASE OR RE-RUN BEFORE REVIEW");
  process.exitCode=1;
}finally{
  try{if(connection)await connection.end();}catch{}
  try{if(pool)await pool.end();}catch{}
}
