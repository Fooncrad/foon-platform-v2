// W07 end-to-end *simulation* only. Local SQLite gateway is real;
// the "cloud" is a durable disposable SQLite inbox behind an injected fetch
// adapter. NO DNS, Internet requests, production MySQL or W05 user DB access.
import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {syncLocalOutbox} from "../../scripts/foon-edge-sync-bridge.mjs";
import {eventDigest} from "../../scripts/foon-edge-sync-contract.mjs";
import {createSandboxReceiver} from "./w07-sandbox-receiver.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const gateway=join(root,"scripts/foon-lan-sqlite.mjs");
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const randomKey=()=>randomBytes(48).toString("hex");
async function freePort(){
 const s=createServer();
 await new Promise((ok,bad)=>s.once("error",bad).listen(0,"127.0.0.1",ok));
 const p=s.address().port;
 await new Promise(ok=>s.close(ok));
 return p;
}
async function environment(){
 const folder=await mkdtemp(join(tmpdir(),"foon-w07-sync-sandbox-"));
 const c={folder,port:await freePort(),db:join(folder,"local.sqlite"),
  cloudDb:join(folder,"sandbox-inbox.sqlite"),token:randomKey(),ack:randomKey(),
  cloudToken:randomKey(),key:randomKey(),branchId:randomUUID(),
  tenantId:randomUUID(),deviceId:randomUUID()};
 const startGateway=()=>spawn(process.execPath,[gateway],{
  cwd:root,windowsHide:true,stdio:"ignore",env:{
   ...process.env,FOON_LAN_HOST:"127.0.0.1",FOON_LAN_PORT:String(c.port),
   FOON_LAN_DB:c.db,FOON_LAN_TOKEN:c.token,
   FOON_EDGE_ACK_SECRET:c.ack,FOON_EDGE_BRANCH_ID:c.branchId,
   FOON_EDGE_TENANT_ID:"",FOON_EDGE_DEVICE_ID:c.deviceId,
   FOON_EDGE_RECEIPT_SIGNING_KEY:"",FOON_EDGE_RECEIPT_KEYS:JSON.stringify({[c.deviceId]:c.key}),
   FOON_EDGE_CLOUD_SYNC_URL:""
  }
 });
 let child=startGateway();
 const localUrl="http://127.0.0.1:"+c.port;
 const call=async(path,method="GET",body,extraHeaders={})=>{
  const res=await fetch(localUrl+path,{
   method,headers:{authorization:"Bearer "+c.token,"content-type":"application/json",...extraHeaders},
   body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(3000)
  });
  return {status:res.status,body:await res.json()};
 };
 async function ready(){
  for(let i=0;i<100;i++){
   if(child.exitCode!==null||child.signalCode!==null)throw Error("W07_GATEWAY_EXITED");
   try{if((await call("/health")).status===200)return;}catch{}
   await pause(60);
  }
  throw Error("W07_GATEWAY_NOT_READY");
 }
 async function stop(){
  if(!child)return;
  const p=child;child=null;
  if(p.exitCode!==null||p.signalCode!==null)return;
  const exit=new Promise(r=>p.once("exit",r));
  p.kill("SIGTERM");
  await Promise.race([exit,pause(2000)]);
  if(p.exitCode===null&&p.signalCode===null){
   p.kill("SIGKILL");
   await Promise.race([exit,pause(2000)]);
  }
  assert(p.exitCode!==null||p.signalCode!==null,"test gateway must stop");
 }
 const receiverSettings={dbPath:c.cloudDb,deviceId:c.deviceId,tenantId:c.tenantId,
  branchId:c.branchId,authToken:c.cloudToken,receiptKey:c.key};
 let receiver=createSandboxReceiver(receiverSettings);
 let online=true,dropAck=false,tamper=false;
 const bridgeConfig={
  localUrl,localToken:c.token,ackSecret:c.ack,
  cloudUrl:"https://w07-sandbox.invalid/edge/sync",
  cloudToken:c.cloudToken,signingSecret:c.key,deviceId:c.deviceId,
  tenantId:c.tenantId,branchId:c.branchId,
  fetchImpl:async(url,options={})=>{
   const target=new URL(url);
   if(target.hostname==="w07-sandbox.invalid"&&target.pathname==="/edge/sync"){
    if(!online)throw Error("W07_SIMULATED_CLOUD_OFFLINE");
    assert.equal(options.method,"POST");
    const body=JSON.parse(options.body);
    const secret=String(options.headers?.authorization||"").replace(/^Bearer /,"");
    const r=receiver.accept(body,secret);
    if(r.body.receipt&&tamper){
     return new Response(JSON.stringify({receipt:{...r.body.receipt,signature:"0".repeat(64)}}),
      {status:r.status,headers:{"content-type":"application/json"}});
    }
    return new Response(JSON.stringify(r.body),{status:r.status,headers:{"content-type":"application/json"}});
   }
   if(target.hostname==="127.0.0.1"&&target.port===String(c.port)){
    if(target.pathname==="/outbox/ack"&&dropAck){
     dropAck=false;
     throw Error("W07_SIMULATED_ACK_LOST_AFTER_COMMIT");
    }
    return fetch(url,options);
   }
   throw Error("W07_BLOCKED_EXTERNAL_NETWORK");
  }
 };
 async function createCompleted(){
  const id=randomUUID();
  const created=await call("/orders","POST",{
   id,branchId:c.branchId,items:[{id:randomUUID(),quantity:1,expectedUnitCents:950,expectedCurrency:"SAR"}]
  });
  assert.equal(created.status,201);
  for(const status of ["preparing","ready","completed"]){
   assert.equal((await call("/orders/"+id+"/status","PATCH",{status})).status,200);
  }
  return id;
 }
 return {c,call,ready,stop,createCompleted,bridgeConfig,
  cloud:()=>receiver,
  setOnline:v=>online=v,setDropAck:v=>dropAck=v,setTamper:v=>tamper=v,
  restartCloud:()=>{receiver.close();receiver=createSandboxReceiver(receiverSettings);},
  close:async()=>{await stop();receiver.close();await rm(folder,{recursive:true,force:true,maxRetries:4,retryDelay:100});}
 };
}

test("W07: simulated offline leaves 4 Outbox events pending; signed receipts ACK only after isolated durable cloud commits",{
 timeout:45000
},async()=>{
 const env=await environment();
 try{
  await env.ready();
  const id=await env.createCompleted();
  env.setOnline(false);
  const offline=await syncLocalOutbox(env.bridgeConfig);
  assert.equal(offline.acked,0);
  assert.equal(offline.retry,1);
  assert.equal(env.cloud().snapshot().inbox,0);
  assert.equal((await env.call("/health")).body.pending,4);
  env.setOnline(true);
  const synced=await syncLocalOutbox(env.bridgeConfig);
  assert.equal(synced.acked,4);
  assert.equal((await env.call("/health")).body.pending,0);
  assert.equal(env.cloud().snapshot().inbox,4);
  assert.deepEqual(env.cloud().snapshot().rows,[{id,status:"completed"}]);
  const repeat=await syncLocalOutbox(env.bridgeConfig);
  assert.equal(repeat.acked,0);
  assert.equal(env.cloud().snapshot().inbox,4);
 }finally{await env.close();}
});

test("W07: cloud commit followed by lost local ACK replays the ORIGINAL signed receipt without duplicate central mutation",{
 timeout:45000
},async()=>{
 const env=await environment();
 try{
  await env.ready();
  await env.createCompleted();
  env.setDropAck(true);
  const lost=await syncLocalOutbox(env.bridgeConfig);
  assert.equal(lost.acked,0);
  assert.equal(lost.retry,1);
  assert.equal(env.cloud().snapshot().inbox,1,"cloud committed first event");
  assert.equal((await env.call("/health")).body.pending,4,"local ACK was not received");
  env.restartCloud();
  const recovered=await syncLocalOutbox(env.bridgeConfig);
  assert.equal(recovered.acked,4);
  assert.equal(env.cloud().snapshot().inbox,4);
  assert.equal((await env.call("/health")).body.pending,0);
 }finally{await env.close();}
});

test("W07: tampered cloud receipt never ACKs, while retry with correct signature succeeds",{
 timeout:45000
},async()=>{
 const env=await environment();
 try{
  await env.ready();
  await env.createCompleted();
  env.setTamper(true);
  const bad=await syncLocalOutbox(env.bridgeConfig);
  assert.equal(bad.acked,0);
  assert.equal(bad.retry,1);
  assert.equal((await env.call("/health")).body.pending,4);
  assert.equal(env.cloud().snapshot().inbox,1);
  env.setTamper(false);
  const good=await syncLocalOutbox(env.bridgeConfig);
  assert.equal(good.acked,4);
  assert.equal(env.cloud().snapshot().inbox,4);
  assert.equal((await env.call("/health")).body.pending,0);
 }finally{await env.close();}
});

test("W07: unauthorized device, branch, tenant, and modified event replay cannot mutate isolated cloud inbox",{
 timeout:45000
},async()=>{
 const env=await environment();
 try{
  await env.ready();
  await env.createCompleted();
  const pending=(await env.call("/outbox")).body.events[0];
  const input={tenantId:env.c.tenantId,branchId:env.c.branchId,
   deviceId:env.c.deviceId,eventSeq:pending.event_seq,orderId:pending.order_id,
   kind:pending.kind,payload:pending.payload,
   digest:eventDigest({seq:pending.event_seq,order_id:pending.order_id,
    kind:pending.kind,payload:pending.payload})};
  const receiver=env.cloud();
  assert.equal(receiver.accept(input,"wrong").status,401);
  assert.equal(receiver.accept({...input,deviceId:randomUUID()},env.c.cloudToken).status,403);
  assert.equal(receiver.accept({...input,branchId:randomUUID()},env.c.cloudToken).status,403);
  assert.equal(receiver.accept({...input,tenantId:randomUUID()},env.c.cloudToken).status,403);
  assert.equal(receiver.snapshot().inbox,0);
  const stored=receiver.accept(input,env.c.cloudToken);
  assert.equal(stored.status,201);
  const duplicate=receiver.accept(input,env.c.cloudToken);
  assert.equal(duplicate.status,200);
  assert.deepEqual(duplicate.body.receipt,stored.body.receipt);
  const altered={...input,payload:{...input.payload,unitPriceChanged:true}};
  altered.digest=eventDigest({seq:altered.eventSeq,order_id:altered.orderId,
   kind:altered.kind,payload:altered.payload});
  assert.equal(receiver.accept(altered,env.c.cloudToken).status,409);
  assert.equal(receiver.snapshot().inbox,1);
  assert.equal((await env.call("/health")).body.pending,4);
 }finally{await env.close();}
});
