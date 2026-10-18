// W10 one-time Windows test. Real local SQLite HTTP gateway + real localhost
// MariaDB transactions behind a loopback test HTTP endpoint. NOT Next.js
// production route; the real production transaction and ACK modules are reused.
// Never rerun once W10 fixture table exists. W08 data is snapshotted and checked.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash,randomUUID,randomBytes} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import mysql from "mysql2/promise";
import {w10LocalUrl,checkW10InitialState,W10_ORDERS_SQL} from "./w10-http-mariadb-guard.mjs";
import {startW10HttpMySqlReceiver} from "./w10-http-mariadb-receiver.mjs";
import {syncLocalOutbox} from "../../scripts/foon-edge-sync-bridge.mjs";
import {deviceReceiptKey} from "../../lib/platform/edge-device-auth.mjs";
import {eventDigest} from "../../scripts/foon-edge-sync-contract.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const randomKey=()=>randomBytes(48).toString("hex");
const wait=ms=>new Promise(done=>setTimeout(done,ms));
const checksum=rows=>createHash("sha256").update(JSON.stringify(rows)).digest("hex");
let phase="TARGET_VALIDATION",created=false,db,pool,gateway,receiver,tempDir,originalInbox,originalOrders;
const url=()=>w10LocalUrl(process.env.EDGE_TEST_DATABASE_URL);
async function readBaseline(connection){
  const [originalOrders]=await connection.execute("SELECT * FROM w08_fixture_orders ORDER BY order_id");
  const [originalInbox]=await connection.execute("SELECT * FROM edge_sync_inbox ORDER BY id");
  return {originalOrders,originalInbox};
}
async function count(sql,params=[]){
  const [[row]]=await pool.execute(sql,params);return Number(row.n);
}
async function freePort(){
  const listener=createServer();
  await new Promise((resolve,reject)=>listener.once("error",reject).listen(0,"127.0.0.1",resolve));
  const port=listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  return port;
}
async function stopGateway(force=false){
  const child=gateway;gateway=null;
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const exited=new Promise(resolve=>child.once("exit",resolve));
  child.kill(force?"SIGKILL":"SIGTERM");
  await Promise.race([exited,wait(3000)]);
  if(child.exitCode===null&&child.signalCode===null){
    child.kill("SIGKILL");
    await Promise.race([exited,wait(3000)]);
  }
  assert(child.exitCode!==null||child.signalCode!==null,"W10_GATEWAY_SHUTDOWN_FAILED");
}

async function main(){
  phase="READ_ONLY_W08_BASELINE";
  db=await mysql.createConnection({uri:url(),connectTimeout:5000,multipleStatements:false});
  const [[identity]]=await db.query("SELECT DATABASE() AS dbname, @@port AS port, CURRENT_USER() AS account");
  const [grants]=await db.query("SHOW GRANTS");
  const [tables]=await db.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME",["foon_edge_test"]);
  const [rows]=await db.query("SELECT (SELECT COUNT(*) FROM edge_sync_inbox) AS inbox, (SELECT COUNT(*) FROM w08_fixture_orders) AS orders");
  checkW10InitialState(identity,grants,tables,rows[0]);
  ({originalOrders,originalInbox}=await readBaseline(db));
  assert.equal(originalOrders.length,4);assert.equal(originalInbox.length,4);
  const w08OrdersDigest=checksum(originalOrders),w08InboxDigest=checksum(originalInbox);
  console.log("W10 VERIFIED: ONLY local foon_edge_test with intact W08 4+4 baseline");

  phase="CREATE_W10_FIXTURE";
  created=true;
  await db.query(W10_ORDERS_SQL);
  console.log("W10 FIXTURE CREATED: w10_http_fixture_orders (no DROP)");

  phase="START_SYNTHETIC_GATEWAY";
  tempDir=await mkdtemp(join(tmpdir(),"foon-w10-http-mariadb-"));
  const port=await freePort(),localUrl="http://127.0.0.1:"+port;
  const localDb=join(tempDir,"temporary-gateway.sqlite");
  const localToken=randomKey(),ackSecret=randomKey(),masterKey=randomKey(),
    deviceToken=randomKey(),identityFixture={tenantId:randomUUID(),branchId:randomUUID(),deviceId:randomUUID()},
    cloudUrl="https://w10-sandbox.invalid/edge/sync";
  const signingSecret=deviceReceiptKey(masterKey,identityFixture.deviceId);
  const inherited={...process.env};
  for(const name of ["DATABASE_URL","EDGE_TEST_DATABASE_URL","FOON_EDGE_MASTER_RECEIPT_KEY"])
    delete inherited[name];
  gateway=spawn(process.execPath,[
      "--require",join(root,"apps/desktop/w06-block-external.cjs"),
      "scripts/foon-lan-sqlite.mjs"
    ],{
      cwd:root,windowsHide:true,stdio:"ignore",
      env:{...inherited,FOON_LAN_DB:localDb,FOON_LAN_PORT:String(port),FOON_LAN_HOST:"127.0.0.1",
      FOON_LAN_TOKEN:localToken,FOON_EDGE_ACK_SECRET:ackSecret,FOON_EDGE_TENANT_ID:"",
      FOON_EDGE_BRANCH_ID:identityFixture.branchId,FOON_EDGE_DEVICE_ID:identityFixture.deviceId,
      FOON_EDGE_RECEIPT_SIGNING_KEY:"",FOON_EDGE_CLOUD_SYNC_URL:"",
      FOON_EDGE_RECEIPT_KEYS:JSON.stringify({[identityFixture.deviceId]:signingSecret}),
      FOON_W06_EXTERNAL_ATTEMPT_MARKER:join(tempDir,"forbidden-network-attempt.txt")}
    });
  const local=async(path,method="GET",data)=>{
    const result=await fetch(localUrl+path,{method,redirect:"error",signal:AbortSignal.timeout(5000),
      headers:{authorization:"Bearer "+localToken,"content-type":"application/json"},
      body:data===undefined?undefined:JSON.stringify(data)});
    return {status:result.status,body:await result.json()};
  };
  let up=false;
  for(let i=0;i<100;i++){
    if(gateway.exitCode!==null||gateway.signalCode!==null)throw Error("W10_GATEWAY_EXITED");
    try{if((await local("/health")).status===200){up=true;break;}}catch{}
    await wait(80);
  }
  assert(up,"W10_GATEWAY_START_FAILED");
  const orderId=randomUUID(),itemId=randomUUID();
  assert.equal((await local("/orders","POST",{id:orderId,branchId:identityFixture.branchId,
    items:[{id:itemId,quantity:2,expectedUnitCents:995,expectedCurrency:"SAR"}]})).status,201);
  for(const status of ["preparing","ready","completed"])
    assert.equal((await local("/orders/"+orderId+"/status","PATCH",{status})).status,200);
  const pendingBefore=(await local("/outbox")).body.events;
  assert.equal(pendingBefore.length,4);

  pool=mysql.createPool({uri:url(),connectionLimit:5,waitForConnections:true});
  let receiverPort=0;
  async function launch(){
    receiver=await startW10HttpMySqlReceiver({
      pool,port:receiverPort,authorization:deviceToken,identity:identityFixture,masterKey
    });
    receiverPort=receiver.port;
  }
  async function stopReceiver(){
    if(receiver){await receiver.stop();receiver=null;}
  }
  const transport=async(input,options={})=>{
    const dest=new URL(input);
    if(dest.href===cloudUrl){
      return fetch("http://127.0.0.1:"+receiverPort+"/edge/sync",{
        ...options,signal:AbortSignal.timeout(4500)});
    }
    if(dest.protocol==="http:"&&dest.hostname==="127.0.0.1"&&
       dest.port===String(port)&&["/outbox","/outbox/ack","/outbox/conflict"].includes(dest.pathname)){
      return fetch(input,{...options,signal:AbortSignal.timeout(4500)});
    }
    throw Error("W10_EXTERNAL_NETWORK_BLOCKED");
  };
  const sync=()=>syncLocalOutbox({localUrl,localToken,ackSecret,cloudUrl,cloudToken:deviceToken,
    deviceId:identityFixture.deviceId,tenantId:identityFixture.tenantId,
    branchId:identityFixture.branchId,signingSecret,fetchImpl:transport});

  phase="NETWORK_OFFLINE";
  const offline=await sync();
  assert.equal(offline.acked,0);assert.equal(offline.retry,1);
  assert.equal((await local("/health")).body.pending,4);
  console.log("PASS: 4 offline SQLite events persisted without cloud ACK");

  phase="LOST_RESPONSE_AFTER_MYSQL_COMMIT";
  await launch();
  receiver.loseNextResponse();
  const lost=await sync();
  assert.equal(lost.acked,0);assert.equal(lost.retry,1);
  assert.equal(await count("SELECT COUNT(*) AS n FROM edge_sync_inbox WHERE device_id=?",[identityFixture.deviceId]),1);
  assert.equal((await local("/health")).body.pending,4);
  console.log("PASS: MariaDB committed inbox+business row before lost TCP response");

  phase="RESTART_HTTP_AND_MYSQL_POOL";
  await stopReceiver();
  await pool.end();pool=null;
  pool=mysql.createPool({uri:url(),connectionLimit:5,waitForConnections:true});
  await launch();
  receiver.tamperReceipts(true);
  const forged=await sync();
  assert.equal(forged.acked,0);
  assert.equal((await local("/health")).body.pending,4);
  receiver.tamperReceipts(false);
  const recovered=await sync();
  assert.equal(recovered.acked,4);
  assert.equal((await local("/health")).body.pending,0);
  const [[saved]]=await pool.execute("SELECT status,item_count,version FROM w10_http_fixture_orders WHERE order_id=?",[orderId]);
  assert.equal(saved.status,"completed");assert.equal(Number(saved.item_count),2);assert.equal(Number(saved.version),4);
  assert.equal(await count("SELECT COUNT(*) AS n FROM edge_sync_inbox WHERE device_id=?",[identityFixture.deviceId]),4);
  assert.equal(await count("SELECT COUNT(*) AS n FROM w10_http_fixture_orders"),1);
  console.log("PASS: MySQL-backed HTTP restart, tampered ACK refusal, replay, exactly once order, final completed status");

  phase="HTTP_AUTH_SCOPE_DIGEST_AND_REPLAY";
  const first=pendingBefore[0];
  const event={...identityFixture,eventSeq:first.event_seq,orderId:first.order_id,
    kind:first.kind,payload:first.payload,digest:eventDigest({
      seq:first.event_seq,order_id:first.order_id,kind:first.kind,payload:first.payload})};
  const http=async(body,token=deviceToken)=>{
    const res=await fetch("http://127.0.0.1:"+receiverPort+"/edge/sync",{
      method:"POST",redirect:"error",signal:AbortSignal.timeout(4500),
      headers:{"content-type":"application/json",authorization:"Bearer "+token},
      body:JSON.stringify(body)});
    return {status:res.status,body:await res.json()};
  };
  assert.equal((await http(event,"0".repeat(96))).status,401);
  assert.equal((await http({...event,tenantId:randomUUID()})).status,403);
  assert.equal((await http({...event,branchId:randomUUID()})).status,403);
  assert.equal((await http({...event,deviceId:randomUUID()})).status,403);
  assert.equal((await http({...event,digest:"0".repeat(64)})).status,400);
  const replay=await http(event);assert.equal(replay.status,200);
  assert.equal(replay.body.duplicate,true);
  assert.equal(await count("SELECT COUNT(*) AS n FROM w10_http_fixture_orders"),1);
  assert.equal(await count("SELECT COUNT(*) AS n FROM edge_sync_inbox"),8);
  console.log("PASS: HTTP token, tenant, branch, device, digest, replay / no duplicate mutation");

  phase="W08_BASELINE_UNCHANGED";
  const [w08OrdersNow]=await pool.execute("SELECT * FROM w08_fixture_orders ORDER BY order_id");
  const [w08InboxNow]=await pool.execute(
    "SELECT * FROM edge_sync_inbox WHERE device_id <> ? ORDER BY id",[identityFixture.deviceId]);
  assert.equal(checksum(w08OrdersNow),w08OrdersDigest);
  assert.equal(checksum(w08InboxNow),w08InboxDigest);
  console.log("PASS: W08 four business rows and four inbox rows preserved byte-for-byte in query representation");
  await stopReceiver();
  await stopGateway();
  console.log("W10 REAL HTTP + LOCAL MARIADB INTEGRATION PASSED");
  console.log("W10: 1 synthetic order, 4 new inbox events; existing W08 4+4 unchanged");
  console.log("NO FULL MIGRATIONS, NO PRODUCTION NEXT.JS ROUTE, NO INTERNET OR WINDOWS SAVED SQLITE");
}

try{await main();}
catch(error){
  const msg=String(error?.message??"");
  console.error("W10 STOPPED at "+phase+": "+
    (/^W10_/.test(msg)?msg:"W10_TEST_ASSERTION_OR_SQL_FAILURE"));
  if(created)console.error("W10 TABLE MAY EXIST; DO NOT RERUN OR DELETE IT BEFORE REVIEW");
  process.exitCode=1;
}finally{
  try{if(receiver)await receiver.stop();}catch{}
  try{await stopGateway();}catch{}
  try{if(pool)await pool.end();}catch{}
  try{if(db)await db.end();}catch{}
  if(tempDir)try{await rm(tempDir,{recursive:true,force:true,maxRetries:4,retryDelay:100});}catch{}
}
