/**
 * FOON Windows W02 — isolated SQLite gateway integration test.
 * No production tenant, Internet request, sync worker or real credentials.
 * Run with Node 24 or 26: node --test apps/desktop/w02-sqlite.integration.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,rm,access} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const gateway=join(repoRoot,"scripts","foon-lan-sqlite.mjs");
const pause=(ms)=>new Promise(done=>setTimeout(done,ms));

async function unusedLoopbackPort(){
 const server=createServer();
 await new Promise((done,fail)=>server.once("error",fail).listen(0,"127.0.0.1",done));
 const port=server.address().port;
 await new Promise(done=>server.close(done));
 return port;
}

async function stop(process){
 if(!process)return;
 if(process.exitCode!==null||process.signalCode!==null)return;
 const exited=new Promise(resolve=>process.once("exit",resolve));
 process.kill("SIGTERM");
 await Promise.race([exited,pause(2500)]);
 if(process.exitCode===null&&process.signalCode===null){
   process.kill("SIGKILL");
   await Promise.race([exited,pause(2500)]);
 }
}
function start(config){
 const child=spawn(process.execPath,[gateway],{
  cwd:repoRoot,windowsHide:true,stdio:["ignore","ignore","ignore"],
  env:{...process.env,
   FOON_LAN_HOST:"127.0.0.1",
   FOON_LAN_PORT:String(config.port),
   FOON_LAN_DB:config.db,
   FOON_LAN_TOKEN:config.token,
   FOON_EDGE_ACK_SECRET:config.ack,
   FOON_EDGE_TENANT_ID:config.tenant,
   FOON_EDGE_BRANCH_ID:config.branch,
   FOON_EDGE_DEVICE_ID:config.device,
   FOON_EDGE_RECEIPT_KEYS:JSON.stringify({[config.device]:config.receipt}),
   FOON_EDGE_CLOUD_SYNC_URL:""
  }
 });
 return child;
}
async function request(config,path,method="GET",body,authorized=true){
 const res=await fetch("http://127.0.0.1:"+config.port+path,{
  method,headers:{"content-type":"application/json",...(authorized?{authorization:"Bearer "+config.token,"x-foon-edge-device-id":config.device}:{})},
  body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(2500)
 });
 const json=await res.json();
 return {status:res.status,body:json};
}
async function ready(config,child){
 for(let i=0;i<100;i++){
  if(child.exitCode!==null||child.signalCode!==null)throw Error("SQLITE_GATEWAY_EXITED");
  try{
   const r=await request(config,"/health");
   if(r.status===200&&r.body.storage==="sqlite-wal-full")return;
  }catch{}
  await pause(75);
 }
 throw Error("SQLITE_GATEWAY_NOT_READY");
}

test("W02: local SQLite orders are authenticated, idempotent, durable and never synchronized automatically",{
 timeout:45000
},async()=>{
 await access(gateway);
 const dir=await mkdtemp(join(tmpdir(),"foon-w02-isolated-"));
 const config={
  port:await unusedLoopbackPort(),
  db:join(dir,"orders.sqlite"),
  token:randomBytes(48).toString("hex"),
  ack:randomBytes(48).toString("hex"),
  receipt:randomBytes(48).toString("hex"),
  tenant:randomUUID(),
  branch:randomUUID(),
  device:randomUUID()
 };
 let child;
 try {
  child=start(config);
  await ready(config,child);

  const unauthenticated=await request(config,"/health","GET",undefined,false);
  assert.equal(unauthenticated.status,401);

  const id=randomUUID(),itemId=randomUUID();
  const order={id,branchId:config.branch,items:[{
   id:itemId,quantity:2,expectedUnitCents:950,expectedCurrency:"SAR"
  }]};

  const created=await request(config,"/orders","POST",order);
  assert.equal(created.status,201,"order must be created locally");
  assert.equal(created.body.order.id,id);

  const duplicate=await request(config,"/orders","POST",order);
  assert.equal(duplicate.status,200,"replayed order must not duplicate");
  assert.equal(duplicate.body.duplicate,true);

  const conflict=await request(config,"/orders","POST",{
   ...order,items:[{...order.items[0],quantity:3}]
  });
  assert.equal(conflict.status,409,"changed replay must be rejected");

  for(const status of ["preparing","ready"]){
   const update=await request(config,"/orders/"+id+"/status","PATCH",{status});
   assert.equal(update.status,200,status);
  }
  const invalid=await request(config,"/orders/"+id+"/status","PATCH",{status:"new"});
  assert.equal(invalid.status,409);

  const before=await request(config,"/orders");
  assert.equal(before.status,200);
  assert.equal(before.body.orders.length,1);
  assert.equal(before.body.orders[0].status,"ready");
  assert.equal(before.body.orders[0].pending_events,3);

  const outbox=await request(config,"/outbox");
  assert.equal(outbox.status,200);
  assert.equal(outbox.body.events.length,3);

  await stop(child);
  child=null;
  child=start(config);
  await ready(config,child);

  const restored=await request(config,"/orders");
  assert.equal(restored.status,200);
  assert.equal(restored.body.orders.length,1);
  assert.equal(restored.body.orders[0].id,id);
  assert.equal(restored.body.orders[0].status,"ready");
  assert.equal(restored.body.orders[0].pending_events,3);

  const health=await request(config,"/health");
  assert.equal(health.body.pending,3);
 } finally {
  await stop(child);
  await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:200});
 }
});
