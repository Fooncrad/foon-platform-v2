import {createServer} from "node:net";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";
import {randomBytes,randomUUID} from "node:crypto";
import {createEdgeConsoleServer,hashOperatorPassword} from "./foon-edge-console-server.mjs";
export async function freePort(){const server=createServer();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
export async function localConsoleFixture(){
 const directory=await mkdtemp(join(tmpdir(),"foon-console-test-")),gatewayPort=await freePort(),consolePort=await freePort();
 const gatewayToken=randomBytes(48).toString("hex"),ackSecret=randomBytes(48).toString("hex"),branchId=randomUUID(),tenantId=randomUUID(),itemId=randomUUID();
 const password="test-only-operator-password",users=[];
 for(const role of ["cashier","kitchen"])users.push({username:role,passwordHash:await hashOperatorPassword(password),role,tenantId,branchId,deviceId:randomUUID(),signingSecret:randomBytes(48).toString("hex")});
 const now=Date.now(),catalog=user=>({identity:{deviceId:user.deviceId,tenantId,branchId,role:user.role},savedAt:new Date(now).toISOString(),validUntil:new Date(now+8*60*60*1000).toISOString(),items:[{id:itemId,name:"قهوة",price:"9.95",currency:"SAR",category:"مشروبات"}]});
 const origin="http://127.0.0.1:"+consolePort,gatewayUrl="http://127.0.0.1:"+gatewayPort;
 const child=spawn(process.execPath,["scripts/foon-lan-sqlite.mjs"],{env:{...process.env,FOON_LAN_PORT:String(gatewayPort),FOON_LAN_TOKEN:gatewayToken,FOON_LAN_DB:join(directory,"orders.sqlite"),FOON_EDGE_ACK_SECRET:ackSecret,FOON_EDGE_TENANT_ID:tenantId,FOON_EDGE_BRANCH_ID:branchId,FOON_EDGE_DEVICE_ID:"",FOON_EDGE_RECEIPT_KEYS:JSON.stringify(Object.fromEntries(users.map(user=>[user.deviceId,user.signingSecret])))},stdio:"ignore"});
 const gateway=(path,method="GET",body)=>fetch(gatewayUrl+path,{method,headers:{authorization:"Bearer "+gatewayToken,"x-foon-edge-ack-secret":ackSecret,"content-type":"application/json"},body:body?JSON.stringify(body):undefined});
 let server;
 const close=async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(child.exitCode===null)await new Promise(resolve=>{child.once("exit",resolve);child.kill();});await rm(directory,{recursive:true,force:true});};
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await gateway("/health")).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}if(!ready)throw Error("FIXTURE_GATEWAY_START_FAILED");
  server=createEdgeConsoleServer({users,origin,gatewayUrl,gatewayToken,ackSecret,readCatalog:catalog});await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(consolePort,"127.0.0.1",resolve);});
  return {origin,users,password,branchId,tenantId,itemId,gatewayToken,gateway,close};
 }catch(error){await close();throw error;}
}
