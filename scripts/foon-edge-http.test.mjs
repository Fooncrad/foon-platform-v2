import test from "node:test";
import assert from "node:assert/strict";
import {receiveEdgeRequest,EDGE_PERMANENT_CONFLICTS} from "../lib/platform/edge-sync-http.mjs";
import {authenticateEdgeDevice,deviceTokenHash,deviceReceiptKey,requireEdgePermission} from "../lib/platform/edge-device-auth.mjs";
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

test("edge permission honors branch assignment and explicit denial over broad manage",async()=>{
 let assigned=true,grants=[{permission_key:"pos.manage",allowed:1}];const queries=[];
 const connection={execute:async(sql,args)=>{queries.push({sql,args});return [sql.includes("employee_branch_assignments")?(assigned?[{id:"assignment"}]:[]):grants];}};
 await requireEdgePermission(connection,identity,"pos","create",true);
 assert.ok(queries.every(q=>q.sql.endsWith("FOR UPDATE")&&q.args.includes(identity.branchId)));
 grants.push({permission_key:"pos.create",allowed:0});await assert.rejects(()=>requireEdgePermission(connection,identity,"pos","create",true),/EDGE_FORBIDDEN/);
 grants=[{permission_key:"pos.create",allowed:1}];assigned=false;await assert.rejects(()=>requireEdgePermission(connection,identity,"pos","create"),/EDGE_FORBIDDEN/);
});

test("malformed carts and permanently invalid sync payloads require review, not retry",()=>{
 for(const code of ["EDGE_INVALID_ORDER_CREATE","EDGE_INVALID_CART","EDGE_INVALID_CART_ITEM","EDGE_INVALID_CATALOG_PRICE","EDGE_ORDER_TOTAL_OVERFLOW","EDGE_ORDER_CHANNEL_NOT_READY","EDGE_INVALID_CHECKOUT_SETTINGS","EDGE_CATALOG_PRICE_CHANGED"]){
  assert.equal(EDGE_PERMANENT_CONFLICTS.has(code),true,code+" should result in HTTP 409");
 }
 for(const code of ["EDGE_NOT_CONFIGURED","EDGE_SYNC_UNAVAILABLE","ER_LOCK_DEADLOCK","EDGE_ORDER_POLICY_UNRESOLVED"]){
  assert.equal(EDGE_PERMANENT_CONFLICTS.has(code),false,code+" should not be marked as a permanent cart conflict");
 }
});
