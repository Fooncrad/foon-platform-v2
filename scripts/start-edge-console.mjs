// Trusted local host only. User/device secrets stay in this process and SQLite gateway.
import {readFile,writeFile,mkdir,rename} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {spawn} from "node:child_process";
import {createEdgeConsoleServer} from "./foon-edge-console-server.mjs";
import {syncLocalOutbox,validateCloudEndpoint} from "./foon-edge-sync-bridge.mjs";

const users=JSON.parse(await readFile(process.env.FOON_EDGE_USERS_FILE,"utf8"));
if(!Array.isArray(users)||!users.length||users.some(user=>typeof user.cloudToken!=="string"||!/^[a-f0-9]{96}$/.test(user.cloudToken)||typeof user.signingSecret!=="string"||user.signingSecret.length<32))throw Error("INVALID_EDGE_USERS_CONFIGURATION");
const localToken=process.env.FOON_LAN_TOKEN,ackSecret=process.env.FOON_EDGE_ACK_SECRET;
if([localToken,ackSecret].some(key=>typeof key!=="string"||key.length<32))throw Error("LOCAL_SERVICE_KEYS_REQUIRED");
const cloud=validateCloudEndpoint(process.env.FOON_EDGE_CLOUD_SYNC_URL),gatewayPort=Number(process.env.FOON_LAN_PORT||8787),consolePort=Number(process.env.FOON_EDGE_CONSOLE_PORT||8788);
if(![gatewayPort,consolePort].every(port=>Number.isSafeInteger(port)&&port>0&&port<=65535)||gatewayPort===consolePort)throw Error("INVALID_LOCAL_PORTS");
const gatewayUrl="http://127.0.0.1:"+gatewayPort,origin=process.env.FOON_EDGE_CONSOLE_ORIGIN||"http://127.0.0.1:"+consolePort;
const cacheFile=resolve(process.env.FOON_EDGE_CATALOG_CACHE||"./data/edge-catalog.json"),catalogs=new Map(),states=new Map();
try{const saved=JSON.parse(await readFile(cacheFile,"utf8"));if(Array.isArray(saved))for(const value of saved)catalogs.set(value.identity?.deviceId,value);}catch(error){if(error.code!=="ENOENT")throw Error("INVALID_CATALOG_CACHE");}
const timedFetch=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(15000)});
const server=createEdgeConsoleServer({users,origin,gatewayUrl,gatewayToken:localToken,ackSecret,readCatalog:user=>catalogs.get(user.deviceId),syncStatus:user=>states.get(user.deviceId)||{state:"offline"},fetchImpl:timedFetch});
const gateway=spawn(process.execPath,["scripts/foon-lan-sqlite.mjs"],{env:{...process.env,FOON_LAN_HOST:"127.0.0.1",FOON_LAN_PORT:String(gatewayPort),FOON_EDGE_TENANT_ID:users[0].tenantId,FOON_EDGE_BRANCH_ID:users[0].branchId,FOON_EDGE_RECEIPT_KEYS:JSON.stringify(Object.fromEntries(users.map(user=>[user.deviceId,user.signingSecret])))},stdio:["ignore","inherit","inherit"]});
let stopping=false,cycleRunning=false;
for(let i=0;i<100;i++){if(gateway.exitCode!==null)throw Error("LOCAL_GATEWAY_START_FAILED");try{if((await timedFetch(gatewayUrl+"/health",{headers:{authorization:"Bearer "+localToken}})).ok)break;}catch{}if(i===99)throw Error("LOCAL_GATEWAY_START_FAILED");await new Promise(resolve=>setTimeout(resolve,100));}
async function cycle(){
 if(stopping||cycleRunning)return;cycleRunning=true;
 try{
  for(const user of users){
   try{
    const result=await syncLocalOutbox({localUrl:gatewayUrl,localToken,ackSecret,cloudUrl:cloud.href,cloudToken:user.cloudToken,deviceId:user.deviceId,tenantId:user.tenantId,branchId:user.branchId,signingSecret:user.signingSecret,fetchImpl:timedFetch});
    states.set(user.deviceId,{state:result.conflicts?"conflict":result.retry?"retry":"synced",lastAt:new Date().toISOString()});
    const response=await timedFetch(new URL("/api/edge/catalog",cloud),{redirect:"error",headers:{authorization:"Bearer "+user.cloudToken}});
    if(!response.ok){if([401,403].includes(response.status))catalogs.delete(user.deviceId);throw Error("CLOUD_CATALOG_UNAVAILABLE");}
    const snapshot=await response.json();
    if(!snapshot.identity||["deviceId","tenantId","branchId","role"].some(key=>snapshot.identity[key]!==user[key])||!Array.isArray(snapshot.items)||!Array.isArray(snapshot.orders)){catalogs.delete(user.deviceId);throw Error("CLOUD_CATALOG_SCOPE_MISMATCH");}
    const imported=await timedFetch(gatewayUrl+"/cloud/state",{method:"POST",redirect:"error",headers:{authorization:"Bearer "+localToken,"content-type":"application/json"},body:JSON.stringify({tenantId:user.tenantId,branchId:user.branchId,orders:snapshot.orders})});
    if(!imported.ok)throw Error("CLOUD_STATE_IMPORT_FAILED");
    if((await imported.json()).conflicts)states.set(user.deviceId,{state:"conflict",lastAt:new Date().toISOString()});
    catalogs.set(user.deviceId,snapshot);
   }catch{states.set(user.deviceId,{state:"offline",lastAt:new Date().toISOString()});}
  }
  await mkdir(dirname(cacheFile),{recursive:true});const temporary=cacheFile+".tmp";
  await writeFile(temporary,JSON.stringify([...catalogs.values()]),{mode:0o600});await rename(temporary,cacheFile);
 }finally{cycleRunning=false;}
}
await cycle();
server.listen(consolePort,"127.0.0.1",()=>process.stdout.write("FOON local console: "+origin+"\n"));
const timer=setInterval(()=>void cycle().catch(()=>{}),5000);
async function shutdown(){if(stopping)return;stopping=true;clearInterval(timer);server.close();gateway.kill();}
gateway.on("exit",()=>{if(!stopping){process.stderr.write("Local gateway stopped; console is shutting down.\n");void shutdown();process.exitCode=1;}});
process.on("SIGTERM",()=>void shutdown());process.on("SIGINT",()=>void shutdown());
