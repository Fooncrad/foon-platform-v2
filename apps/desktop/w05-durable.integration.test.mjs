// W05 disposable synthetic fixture: durable SQLite across two restarts, no cloud or production.
import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,rm,writeFile,readFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const gateway=join(root,"scripts","foon-lan-sqlite.mjs");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){
 const server=createServer();
 await new Promise((ok,bad)=>server.once("error",bad).listen(0,"127.0.0.1",ok));
 const n=server.address().port;
 await new Promise(ok=>server.close(ok));return n;
}
function boot(c){
 return spawn(process.execPath,[gateway],{cwd:root,windowsHide:true,stdio:"ignore",env:{
  ...process.env,FOON_LAN_DB:c.db,FOON_LAN_HOST:"127.0.0.1",
  FOON_LAN_PORT:String(c.port),FOON_LAN_TOKEN:c.token,
  FOON_EDGE_ACK_SECRET:randomBytes(48).toString("hex"),
  FOON_EDGE_TENANT_ID:"",FOON_EDGE_BRANCH_ID:c.branch,
  FOON_EDGE_DEVICE_ID:"",FOON_EDGE_RECEIPT_KEYS:"{}",
  FOON_EDGE_CLOUD_SYNC_URL:"",FOON_EDGE_RECEIPT_SIGNING_KEY:""
 }});
}
async function request(c,path,method="GET",body){
 const res=await fetch("http://127.0.0.1:"+c.port+path,{
  method,headers:{authorization:"Bearer "+c.token,"content-type":"application/json"},
  body:body===undefined?undefined:JSON.stringify(body),
  signal:AbortSignal.timeout(1800)
 });
 return {status:res.status,body:await res.json()};
}
async function ready(c,child){
 for(let i=0;i<80;i++){
  if(child.exitCode!==null||child.signalCode!==null)throw Error("W05_GATEWAY_EXITED");
  try{const r=await request(c,"/health");if(r.status===200&&r.body.storage==="sqlite-wal-full")return;}catch{}
  await wait(70);
 }
 throw Error("W05_GATEWAY_NOT_READY");
}
async function halt(child,signal="SIGTERM"){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 const exited=new Promise(r=>child.once("exit",r));
 child.kill(signal);
 await Promise.race([exited,wait(2500)]);
 if(child.exitCode===null&&child.signalCode===null){
  child.kill("SIGKILL");await Promise.race([exited,wait(2500)]);
 }
 assert.equal(child.exitCode===null&&child.signalCode===null,false,"gateway failed to stop");
}
test("W05: one synthetic branch, four pending outbox events survive restart, token rotation and abrupt exit",{timeout:45000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),"foon-w05-synthetic-"));
 const manifest=join(dir,"demo-branch.txt");
 const branch=randomUUID(),db=join(dir,"orders.sqlite");
 await writeFile(manifest,branch,{flag:"wx"});
 const c={port:await port(),token:randomBytes(48).toString("hex"),branch,db};
 let child;
 try{
  child=boot(c);await ready(c,child);
  const id=randomUUID();
  assert.equal((await request(c,"/orders","POST",{id,branchId:branch,
   items:[{id:randomUUID(),quantity:1,expectedUnitCents:950,expectedCurrency:"SAR"}]
  })).status,201);
  assert.equal((await request(c,"/orders","POST",{id:randomUUID(),branchId:randomUUID(),
   items:[{id:randomUUID(),quantity:1}]
  })).status,400,"different branch must fail");
  for(const status of ["preparing","ready","completed"]){
   assert.equal((await request(c,"/orders/"+id+"/status","PATCH",{status})).status,200);
  }
  assert.equal((await request(c,"/health")).body.pending,4);
  await halt(child);child=null;
  const storage=new DatabaseSync(db);
  try{
   assert.equal(Object.values(storage.prepare("PRAGMA quick_check").get())[0],"ok");
   assert.equal(storage.prepare("SELECT count(*) AS n FROM orders").get().n,1);
   assert.equal(storage.prepare("SELECT count(*) AS n FROM outbox WHERE synced_at IS NULL").get().n,4);
  }finally{storage.close();}
  c.token=randomBytes(48).toString("hex");
  child=boot(c);await ready(c,child);
  const r=await request(c,"/orders");
  assert.equal(r.body.orders.length,1);
  assert.equal(r.body.orders[0].id,id);
  assert.equal(r.body.orders[0].status,"completed");
  assert.equal(r.body.orders[0].pending_events,4);
  assert.equal((await readFile(manifest,"utf8")).trim(),branch);
  await halt(child,"SIGKILL");child=null;
  c.token=randomBytes(48).toString("hex");
  child=boot(c);await ready(c,child);
  assert.equal((await request(c,"/health")).body.pending,4);
  assert.equal((await request(c,"/outbox")).body.events.length,4);
 }finally{
  await halt(child);
  await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
});
