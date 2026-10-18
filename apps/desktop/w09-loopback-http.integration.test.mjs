// W09 end-to-end test: ACTUAL TCP/HTTP for both local gateway and sandbox
// receiver. Sender's production cloud URL safety rules remain unchanged;
// a test-only injected fetch re-routes an .invalid hostname to 127.0.0.1.
// All SQLite files are disposable under os.tmpdir(), never W05/W06.
import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,rm,access} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join,dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {syncLocalOutbox,validateCloudEndpoint} from "../../scripts/foon-edge-sync-bridge.mjs";
import {eventDigest} from "../../scripts/foon-edge-sync-contract.mjs";
import {startW09LoopbackReceiver} from "./w09-loopback-http-receiver.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const gatewayFile=join(root,"scripts/foon-lan-sqlite.mjs");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const secret=()=>randomBytes(48).toString("hex");
async function freePort(){
  const s=createServer();
  await new Promise((ok,bad)=>s.once("error",bad).listen(0,"127.0.0.1",ok));
  const port=s.address().port;
  await new Promise(ok=>s.close(ok));
  return port;
}

async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),"foon-w09-http-"));
  const config={dir,blockedMarker:join(dir,"blocked-external-connection.txt"),localPort:await freePort(),
    localDb:join(dir,"gateway.sqlite"),remoteDb:join(dir,"http-receiver.sqlite"),
    localToken:secret(),ackSecret:secret(),remoteToken:secret(),receiptKey:secret(),
    tenantId:randomUUID(),branchId:randomUUID(),deviceId:randomUUID()};
  const localUrl="http://127.0.0.1:"+config.localPort;
  const cloudUrl="https://w09-sandbox.invalid/edge/sync";
  let gateway,cloud,cloudPort=0;
  const local=async(path,method="GET",body)=>{
    const res=await fetch(localUrl+path,{method,redirect:"error",
      headers:{authorization:"Bearer "+config.localToken,"content-type":"application/json"},
      body:body===undefined?undefined:JSON.stringify(body),
      signal:AbortSignal.timeout(3500)});
    return {status:res.status,body:await res.json()};
  };
  async function startGateway(){
    assert(!gateway,"gateway already running");
    const isolatedEnv={...process.env};
    for(const name of ["DATABASE_URL","EDGE_TEST_DATABASE_URL","FOON_EDGE_MASTER_RECEIPT_KEY"])
      delete isolatedEnv[name];
    gateway=spawn(process.execPath,["--require",join(root,"apps/desktop/w06-block-external.cjs"),gatewayFile],{
      cwd:root,windowsHide:true,stdio:"ignore",
      env:{...isolatedEnv,
        FOON_W06_EXTERNAL_ATTEMPT_MARKER:config.blockedMarker,
        FOON_LAN_HOST:"127.0.0.1",FOON_LAN_PORT:String(config.localPort),
        FOON_LAN_DB:config.localDb,FOON_LAN_TOKEN:config.localToken,
        FOON_EDGE_ACK_SECRET:config.ackSecret,
        FOON_EDGE_DEVICE_ID:config.deviceId,FOON_EDGE_BRANCH_ID:config.branchId,
        FOON_EDGE_TENANT_ID:"",FOON_EDGE_RECEIPT_SIGNING_KEY:"",
        FOON_EDGE_RECEIPT_KEYS:JSON.stringify({[config.deviceId]:config.receiptKey}),
        FOON_EDGE_CLOUD_SYNC_URL:""}
    });
    for(let i=0;i<100;i++){
      if(gateway.exitCode!==null||gateway.signalCode!==null)throw Error("W09_GATEWAY_EXITED");
      try{
        const health=await local("/health");
        if(health.status===200&&health.body.storage==="sqlite-wal-full")return;
      }catch{}
      await wait(70);
    }
    throw Error("W09_GATEWAY_NOT_READY");
  }
  async function stopGateway(force=false){
    const child=gateway;gateway=null;
    if(!child||child.exitCode!==null||child.signalCode!==null)return;
    const exited=new Promise(resolve=>child.once("exit",resolve));
    child.kill(force?"SIGKILL":"SIGTERM");
    await Promise.race([exited,wait(3000)]);
    if(child.exitCode===null&&child.signalCode===null){
      child.kill("SIGKILL");await Promise.race([exited,wait(3000)]);
    }
    assert(child.exitCode!==null||child.signalCode!==null,"W09 gateway must stop");
  }
  async function startCloud(){
    assert(!cloud,"receiver already running");
    cloud=await startW09LoopbackReceiver({
      port:cloudPort,dbPath:config.remoteDb,
      deviceId:config.deviceId,tenantId:config.tenantId,
      branchId:config.branchId,authToken:config.remoteToken,
      receiptKey:config.receiptKey
    });
    cloudPort=cloud.port;
    return cloud;
  }
  async function stopCloud(){
    const server=cloud;cloud=null;
    if(server)await server.stop();
  }
  // The ONLY remote sink is the bound loopback test receiver. No production
  // URLs, DNS lookups, private LAN, or any other HTTP endpoint are allowed.
  const transport=async(input,init={})=>{
    const url=new URL(input);
    if(url.href===cloudUrl){
      return fetch("http://127.0.0.1:"+cloudPort+"/edge/sync",{
        ...init,signal:AbortSignal.timeout(4000)});
    }
    if(url.protocol==="http:"&&url.hostname==="127.0.0.1"&&
       url.port===String(config.localPort)&&
       ["/outbox","/outbox/ack","/outbox/conflict"].includes(url.pathname)){
      return fetch(input,{...init,signal:AbortSignal.timeout(4000)});
    }
    throw Error("W09_UNEXPECTED_NETWORK_DESTINATION");
  };
  const sync=()=>syncLocalOutbox({
    localUrl,localToken:config.localToken,ackSecret:config.ackSecret,
    cloudUrl,cloudToken:config.remoteToken,
    signingSecret:config.receiptKey,
    tenantId:config.tenantId,branchId:config.branchId,
    deviceId:config.deviceId,fetchImpl:transport
  });
  const makeCompleted=async()=>{
    const id=randomUUID();
    assert.equal((await local("/orders","POST",{
      id,branchId:config.branchId,
      items:[{id:randomUUID(),quantity:1,expectedUnitCents:995,expectedCurrency:"SAR"}]
    })).status,201);
    for(const status of ["preparing","ready","completed"])
      assert.equal((await local("/orders/"+id+"/status","PATCH",{status})).status,200);
    return id;
  };
  const httpCloud=async(event,token=config.remoteToken)=>{
    const res=await fetch("http://127.0.0.1:"+cloudPort+"/edge/sync",{
      method:"POST",redirect:"error",
      headers:{authorization:"Bearer "+token,"content-type":"application/json"},
      body:JSON.stringify(event),signal:AbortSignal.timeout(4000)});
    return {status:res.status,body:await res.json()};
  };
  const close=async()=>{
    await stopGateway();
    await stopCloud();
    try{
      await access(config.blockedMarker);
      throw Error("W09_EXTERNAL_NETWORK_ATTEMPT_DETECTED");
    }catch(error){if(error?.code!=="ENOENT")throw error;}
    await rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:150});
  };
  try{
    await startGateway();
    await startCloud();
    return {config,local,cloud:()=>cloud,startCloud,stopCloud,
      startGateway,stopGateway,makeCompleted,sync,httpCloud,close};
  }catch(error){await close();throw error;}
}

test("W09: actual localhost HTTP receiver is unreachable offline; after a gateway crash and receiver restart, four pending events ACK exactly once",{
  timeout:60000
},async()=>{
  const env=await fixture();
  try{
    const orderId=await env.makeCompleted();
    assert.equal((await env.local("/health")).body.pending,4);
    await env.stopCloud();
    const offline=await env.sync();
    assert.equal(offline.acked,0);
    assert.equal(offline.retry,1);
    assert.equal((await env.local("/health")).body.pending,4);
    await env.stopGateway(true);
    await env.startGateway();
    assert.equal((await env.local("/health")).body.pending,4,"SQLite Outbox survives a forced restart");
    await env.startCloud();
    const resumed=await env.sync();
    assert.equal(resumed.acked,4);
    assert.equal((await env.local("/health")).body.pending,0);
    assert.deepEqual(env.cloud().snapshot(),{
      inbox:4,orders:1,rows:[{id:orderId,status:"completed"}]
    });
    const replay=await env.sync();
    assert.equal(replay.acked,0);
    assert.equal(env.cloud().snapshot().inbox,4);
  }finally{await env.close();}
});

test("W09: lost HTTP response AFTER durable remote commit retries without central duplicate, including after server restart",{
  timeout:60000
},async()=>{
  const env=await fixture();
  try{
    await env.makeCompleted();
    env.cloud().loseNextResponse();
    const lost=await env.sync();
    assert.equal(lost.acked,0);
    assert.equal(lost.retry,1);
    assert.equal(env.cloud().snapshot().inbox,1,"remote committed before TCP was cut");
    assert.equal((await env.local("/health")).body.pending,4);
    await env.stopCloud();
    await env.startCloud();
    const recovered=await env.sync();
    assert.equal(recovered.acked,4);
    assert.equal((await env.local("/health")).body.pending,0);
    assert.equal(env.cloud().snapshot().inbox,4,"idempotency survives remote HTTP receiver restart");
  }finally{await env.close();}
});

test("W09: tampered HTTP receipt never ACKs local SQLite; authentic signed replay recovers",{
  timeout:60000
},async()=>{
  const env=await fixture();
  try{
    await env.makeCompleted();
    env.cloud().tamperReceipts(true);
    const tampered=await env.sync();
    assert.equal(tampered.acked,0);
    assert.equal(tampered.retry,1);
    assert.equal(env.cloud().snapshot().inbox,1);
    assert.equal((await env.local("/health")).body.pending,4);
    env.cloud().tamperReceipts(false);
    const good=await env.sync();
    assert.equal(good.acked,4);
    assert.equal(env.cloud().snapshot().inbox,4);
    assert.equal((await env.local("/health")).body.pending,0);
  }finally{await env.close();}
});

test("W09: actual HTTP endpoint refuses wrong token, tenant, branch, device and digest without changing durable state",{
  timeout:60000
},async()=>{
  const env=await fixture();
  try{
    await env.makeCompleted();
    const first=(await env.local("/outbox")).body.events[0];
    const e={tenantId:env.config.tenantId,branchId:env.config.branchId,
      deviceId:env.config.deviceId,eventSeq:first.event_seq,
      orderId:first.order_id,kind:first.kind,payload:first.payload,
      digest:eventDigest({seq:first.event_seq,order_id:first.order_id,
        kind:first.kind,payload:first.payload})};
    assert.equal((await env.httpCloud(e,"wrong-token")).status,401);
    assert.equal((await env.httpCloud({...e,tenantId:randomUUID()})).status,403);
    assert.equal((await env.httpCloud({...e,branchId:randomUUID()})).status,403);
    assert.equal((await env.httpCloud({...e,deviceId:randomUUID()})).status,403);
    assert.equal((await env.httpCloud({...e,digest:"0".repeat(64)})).status,409);
    assert.equal(env.cloud().snapshot().inbox,0);
    assert.equal((await env.local("/health")).body.pending,4);
    const good=await env.sync();
    assert.equal(good.acked,4);
    assert.equal(env.cloud().snapshot().inbox,4);
  }finally{await env.close();}
});

test("W09: production sender still rejects plain HTTP/local cloud endpoints",()=>{
  for(const cloud of [
    "http://127.0.0.1:9999/edge/sync",
    "https://127.0.0.1/edge/sync",
    "https://localhost/edge/sync",
    "https://w09-sandbox.local/edge/sync"
  ])assert.throws(()=>validateCloudEndpoint(cloud));
});
