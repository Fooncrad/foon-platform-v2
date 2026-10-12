import test from "node:test";
import assert from "node:assert/strict";
import {receiveEdgeRequest} from "../lib/platform/edge-sync-http.mjs";
import {authenticateEdgeDevice,deviceTokenHash,deviceReceiptKey} from "../lib/platform/edge-device-auth.mjs";
import {eventDigest} from "./foon-edge-sync-contract.mjs";
const token="a".repeat(96),masterKey="m".repeat(64);
const identity={deviceId:"device",tenantId:"tenant",branchId:"branch",actorUserId:"33333333-3333-4333-8333-333333333333",role:"cashier"};
const id="11111111-1111-4111-8111-111111111111",itemId="22222222-2222-4222-8222-222222222222";
function event(){const e={...identity,eventSeq:1,orderId:id,kind:"created",payload:{id,branchId:identity.branchId,status:"new",createdAt:new Date().toISOString(),items:[{id:itemId,quantity:1}]}};e.digest=eventDigest({seq:1,order_id:id,kind:e.kind,payload:e.payload});return e;}
const request=(body,authorization="Bearer "+token)=>new Request("https://cloud.example/api/edge/sync",{method:"POST",headers:{authorization,"content-type":"application/json"},body:typeof body==="string"?body:JSON.stringify(body)});
test("device auth rejects malformed tokens without querying and derives separate receipt keys",async()=>{
 let calls=0;const connection={execute:async()=>{calls++;return [[]];}};
 for(const value of [null,"Bearer short","Basic "+token,"Bearer "+token.toUpperCase()])await assert.rejects(()=>authenticateEdgeDevice(connection,value),/DEVICE_UNAUTHORIZED/);
 assert.equal(calls,0);assert.equal(deviceTokenHash(token).length,64);
 assert.notEqual(deviceReceiptKey(masterKey,"a"),deviceReceiptKey(masterKey,"b"));
});
test("HTTP sync fails closed on disabled configuration, foreign scope, invalid JSON and oversized bodies",async()=>{
 const pool={execute:async()=>[[identity]],getConnection:async()=>{throw Error("NO_TRANSACTION_EXPECTED");}};
 assert.equal((await receiveEdgeRequest(request(event()),{pool,masterKey})).status,503);
 const options={pool,masterKey,plainTakeawayEnabled:true};
 assert.equal((await receiveEdgeRequest(request({...event(),tenantId:"foreign"}),options)).status,403);
 assert.equal((await receiveEdgeRequest(request("{"),options)).status,400);
 assert.equal((await receiveEdgeRequest(request("x".repeat(131073)),options)).status,413);
});
test("revocation between initial auth and transaction produces no inbox write or receipt",async()=>{
 let writes=0,rolledBack=false,released=false;
 const pool={execute:async()=>[[identity]],getConnection:async()=>({beginTransaction:async()=>{},execute:async sql=>{if(sql.startsWith("SELECT d.id"))return [[]];writes++;throw Error("UNEXPECTED_WRITE");},rollback:async()=>{rolledBack=true;},release(){released=true;}})};
 const result=await receiveEdgeRequest(request(event()),{pool,masterKey,plainTakeawayEnabled:true});
 assert.equal(result.status,401);assert.equal((await result.json()).receipt,undefined);assert.equal(writes,0);assert.equal(rolledBack,true);assert.equal(released,true);
});
