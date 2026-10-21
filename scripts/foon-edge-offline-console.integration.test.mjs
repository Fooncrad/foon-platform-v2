// W27 uses fresh OS-temp data. Never import a prior merchant or W05/W06 DB.
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import net from "node:net";
import {fileURLToPath} from "node:url";
import {hashOperatorPassword} from "./foon-edge-console-server.mjs";

async function freePort(){
  const s=net.createServer();
  await new Promise(resolve=>s.listen(0,"127.0.0.1",resolve));
  const port=s.address().port;
  await new Promise(resolve=>s.close(resolve));
  return port;
}

test("W27 cached POS accepts local orders without cloud URL, preserves pending SQLite on restart",async()=>{
 const temp=await mkdtemp(join(tmpdir(),"FOON-W27-Fixture-"));
 const tenantId=randomUUID(),branchId=randomUUID(),deviceId=randomUUID(),itemId=randomUUID();
 const password="synthetic-w27-only",gatewayToken=randomBytes(32).toString("hex");
 const user={username:"cashier",role:"cashier",tenantId,branchId,deviceId,
   signingSecret:randomBytes(48).toString("hex"),passwordHash:await hashOperatorPassword(password)};
 const gatewayPort=await freePort(),consolePort=await freePort(),origin="http://127.0.0.1:"+consolePort;
 const usersFile=join(temp,"users.json"),cacheFile=join(temp,"cache.json"),dbFile=join(temp,"orders.sqlite");
 const savedAt=new Date().toISOString(),validUntil=new Date(Date.now()+3600000).toISOString();
 await writeFile(usersFile,JSON.stringify([user]),{mode:0o600});
 await writeFile(cacheFile,JSON.stringify([{
   identity:{deviceId,tenantId,branchId,role:user.role},savedAt,validUntil,orders:[],
   items:[{id:itemId,name:"Synthetic coffee",price:"9.95",currency:"SAR",category:"Drinks"}]
 }]),{mode:0o600});
 const environment={...process.env,FOON_EDGE_OFFLINE_ONLY:"1",
   FOON_EDGE_USERS_FILE:usersFile,FOON_EDGE_CATALOG_CACHE:cacheFile,FOON_LAN_DB:dbFile,
   FOON_LAN_TOKEN:gatewayToken,FOON_EDGE_ACK_SECRET:randomBytes(48).toString("hex"),
   FOON_LAN_PORT:String(gatewayPort),FOON_EDGE_CONSOLE_PORT:String(consolePort),
   FOON_EDGE_CONSOLE_HOST:"127.0.0.1",FOON_EDGE_CONSOLE_ORIGIN:origin,
   FOON_EDGE_CLOUD_SYNC_URL:"definitely-not-a-url",FOON_EDGE_CONSOLE_CERT_FILE:"",
   FOON_EDGE_CONSOLE_KEY_FILE:""};
 let child;
 const stop=async()=>{
   if(!child)return;
   const processToStop=child;child=undefined;
   if(processToStop.exitCode!==null)return;
   await new Promise(resolve=>{
     const timeout=setTimeout(()=>{processToStop.kill("SIGKILL");resolve();},3000);
     processToStop.once("exit",()=>{clearTimeout(timeout);resolve();});
     processToStop.kill("SIGTERM");
   });
 };
 const launch=async()=>{
   child=spawn(process.execPath,["scripts/start-edge-console.mjs"],{
      env:environment,stdio:"ignore",cwd:fileURLToPath(new URL("../",import.meta.url))});
   for(let i=0;i<100;i++){
     if(child.exitCode!==null)throw Error("W27_LOCAL_PROCESS_EXITED");
     try {const response=await fetch(origin+"/");if(response.ok)return;}catch{}
     await new Promise(resolve=>setTimeout(resolve,100));
   }
   throw Error("W27_LOCAL_CONSOLE_START_TIMEOUT");
 };
 const api=async(path,method="GET",body,session)=>fetch(origin+path,{
   method,headers:{origin,"content-type":"application/json",
     ...(session?{"cookie":session.cookie,"x-foon-csrf":session.csrf}:{})},
   body:body?JSON.stringify(body):undefined
 });
 const login=async()=>{
   const response=await api("/api/login","POST",{username:user.username,password});
   assert.equal(response.status,200);
   const body=await response.json();
   return {cookie:response.headers.get("set-cookie").split(";")[0],csrf:body.csrf};
 };
 try{
   await launch();const session=await login(),orderId=randomUUID();
   assert.equal((await api("/api/orders","POST",{id:orderId,items:[{id:itemId,quantity:2}]},session)).status,201);
   const first=await (await api("/api/state","GET",undefined,session)).json();
   assert.equal(first.sync.state,"offline-only");assert.equal(first.pending,1);
   assert.equal(first.orders.length,1);assert.equal(first.orders[0].id,orderId);
   await stop();await launch();const again=await login();
   const recovered=await (await api("/api/state","GET",undefined,again)).json();
   assert.equal(recovered.sync.state,"offline-only");
   assert.equal(recovered.pending,1);assert.equal(recovered.orders.length,1);
   assert.equal(recovered.orders[0].id,orderId);
 }finally{await stop();await rm(temp,{recursive:true,force:true});}
});
