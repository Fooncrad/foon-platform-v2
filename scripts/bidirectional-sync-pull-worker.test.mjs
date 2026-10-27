import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {pullAndApplyNextSyncBatch} from "../lib/platform/bidirectional-sync-pull-worker.mjs";
import {signAuthorizedPullBatch} from "../lib/platform/bidirectional-sync-server-signer.mjs";
const scope={deviceId:"11111111-1111-4111-8111-111111111111",tenantId:"22222222-2222-4222-8222-222222222222",branchId:"33333333-3333-4333-8333-333333333333"};
const keys=generateKeyPairSync("ed25519");
const privateKey=keys.privateKey.export({type:"pkcs8",format:"pem"});
const publicKey=keys.publicKey.export({type:"spki",format:"pem"});
const endpoint="https://sync.example.com/api/sync/v1/pull";
function fixture(){const calls=[];const db={calls,async beginTransaction(){calls.push("begin")},async commit(){calls.push("commit")},async rollback(){calls.push("rollback")},async execute(sql){calls.push(sql);if(sql.startsWith("SELECT last_pulled_id"))return [[{last_pulled_id:0}]];return [{affectedRows:1}]}};return db;}
function signedBatch(){return signAuthorizedPullBatch({batch:{ok:true,tenantId:scope.tenantId,branchId:scope.branchId,events:[],nextCursor:0},scope:{...scope,after:0,limit:100},privateKey});}
function response(payload){return {ok:true,status:200,redirected:false,headers:{get:()=>"application/json"},json:async()=>payload};}
test("signed empty pull commits without advancing cursor",async()=>{
 const db=fixture();const result=await pullAndApplyNextSyncBatch({db,scope,baseUrl:endpoint,authorization:"Bearer "+"a".repeat(64),publicKey,applyEvent:async()=>true,fetchImpl:async()=>response(signedBatch())});
 assert.equal(result.status,"applied");assert.equal(result.count,0);assert.equal(db.calls.at(-1),"commit");
 assert.equal(db.calls.some(x=>x.startsWith("UPDATE foon_sync_device_cursors")),false);
});
test("invalid signature cannot begin database mutation",async()=>{
 const db=fixture();const batch=signedBatch();batch.signature="a".repeat(86);
 await assert.rejects(()=>pullAndApplyNextSyncBatch({db,scope,baseUrl:endpoint,authorization:"Bearer "+"a".repeat(64),publicKey,applyEvent:async()=>true,fetchImpl:async()=>response(batch)}),/SYNC_SIGNATURE_INVALID/);
 assert.equal(db.calls.includes("begin"),false);
});
test("offline transport preserves cursor",async()=>{
 const db=fixture();
 await assert.rejects(()=>pullAndApplyNextSyncBatch({db,scope,baseUrl:endpoint,authorization:"Bearer "+"a".repeat(64),publicKey,applyEvent:async()=>true,fetchImpl:async()=>{throw Error("OFFLINE")}}),/OFFLINE/);
 assert.equal(db.calls.includes("begin"),false);
});

test("network recovery retries from unchanged cursor and commits only after signed response",async()=>{
 const db=fixture();let attempts=0;
 const opts={db,scope,baseUrl:endpoint,authorization:"Bearer "+"a".repeat(64),publicKey,applyEvent:async()=>true,
  fetchImpl:async()=>{attempts++;if(attempts===1)throw Error("SIMULATED_NETWORK_DROP");return response(signedBatch());}};
 await assert.rejects(()=>pullAndApplyNextSyncBatch(opts),/SIMULATED_NETWORK_DROP/);
 assert.equal(db.calls.includes("begin"),false);
 const result=await pullAndApplyNextSyncBatch(opts);
 assert.equal(result.nextCursor,0);
 assert.equal(attempts,2);
 assert.equal(db.calls.filter(x=>x==="commit").length,1);
 assert.equal(db.calls.filter(x=>x==="begin").length,1);
});

test("overlapping pull with uppercase UUID scope is blocked before cursor read or network",async()=>{
 const db=fixture();
 let release,entered;
 const gate=new Promise(resolve=>{release=resolve});
 const started=new Promise(resolve=>{entered=resolve});
 const opts={db,scope,baseUrl:endpoint,authorization:"Bearer "+"a".repeat(64),publicKey,applyEvent:async()=>true};
 const first=pullAndApplyNextSyncBatch({...opts,fetchImpl:async()=>{entered();await gate;throw Error("SIMULATED_OFFLINE")}});
 await started;
 let extraFetches=0;
 try{
  await assert.rejects(()=>pullAndApplyNextSyncBatch({...opts,scope:{...scope,deviceId:scope.deviceId.toUpperCase()},fetchImpl:async()=>{extraFetches++;return response(signedBatch())}}),/SYNC_PULL_ALREADY_RUNNING/);
  assert.equal(extraFetches,0);
  assert.equal(db.calls.filter(sql=>sql.startsWith("SELECT last_pulled_id")).length,1,"overlap must not read stale cursor");
 }finally{
  release();
  await assert.rejects(first,/SIMULATED_OFFLINE/);
 }
});
test("pull scope lock is released after network failure so retry can succeed",async()=>{
 const db=fixture();let attempts=0;
 const opts={db,scope,baseUrl:endpoint,authorization:"Bearer "+"a".repeat(64),publicKey,applyEvent:async()=>true,
  fetchImpl:async()=>{attempts++;if(attempts===1)throw Error("SIMULATED_OFFLINE");return response(signedBatch());}};
 await assert.rejects(()=>pullAndApplyNextSyncBatch(opts),/SIMULATED_OFFLINE/);
 const result=await pullAndApplyNextSyncBatch(opts);
 assert.equal(result.status,"applied");
 assert.equal(attempts,2);
 assert.equal(db.calls.filter(x=>x==="commit").length,1);
});

test("pull lock stays held while the local transaction is committing",async()=>{
 const db=fixture();
 let releaseCommit,commitEntered;
 const pendingCommit=new Promise(resolve=>{releaseCommit=resolve});
 const entered=new Promise(resolve=>{commitEntered=resolve});
 let commitCalls=0,networkRequests=0;
 db.commit=async()=>{
  commitCalls++;
  if(commitCalls===1){commitEntered();await pendingCommit;}
  db.calls.push("commit");
 };
 const opts={db,scope,baseUrl:endpoint,authorization:"Bearer "+"a".repeat(64),publicKey,applyEvent:async()=>true,
  fetchImpl:async()=>{networkRequests++;return response(signedBatch());}};
 const first=pullAndApplyNextSyncBatch(opts);
 await entered;
 try{
  // Previously the outer async function returned the receiver's Promise
  // without awaiting it, releasing its finally lock before DB commit.
  await assert.rejects(()=>pullAndApplyNextSyncBatch({...opts,scope:{...scope,deviceId:scope.deviceId.toUpperCase()}}),/SYNC_PULL_ALREADY_RUNNING/);
  assert.equal(networkRequests,1,"no second network pull while first commit is pending");
  assert.equal(commitCalls,1);
 }finally{
  releaseCommit();
  await first;
 }
 const retried=await pullAndApplyNextSyncBatch(opts);
 assert.equal(retried.status,"applied");
 assert.equal(networkRequests,2,"lock is released after commit finishes");
 assert.equal(commitCalls,2);
});

test("pull worker rejects coerced stored cursors before network",async()=>{
 for(const invalid of [null,[],[0],{valueOf:()=>0},"0e0"," 0 ","01"]){
  const db=fixture();let requests=0;
  db.execute=async(sql)=>{db.calls.push(sql);return [[{last_pulled_id:invalid}]];};
  await assert.rejects(()=>pullAndApplyNextSyncBatch({db,scope,baseUrl:endpoint,authorization:"Bearer "+"a".repeat(64),publicKey,applyEvent:async()=>true,fetchImpl:async()=>{requests++;return response(signedBatch());}}),/SYNC_INVALID_CURSOR/);
  assert.equal(requests,0);
  assert.equal(db.calls.includes("begin"),false);
 }
 const db=fixture();db.execute=async(sql)=>{db.calls.push(sql);if(sql.startsWith("SELECT last_pulled_id"))return [[{last_pulled_id:"0"}]];return [{affectedRows:1}];};
 const result=await pullAndApplyNextSyncBatch({db,scope,baseUrl:endpoint,authorization:"Bearer "+"a".repeat(64),publicKey,applyEvent:async()=>true,fetchImpl:async()=>response(signedBatch())});
 assert.equal(result.nextCursor,0);
});

test("pull scope rejects coercible UUID values before SQL or network",async()=>{
 for(const key of ["deviceId","tenantId","branchId"]){
  for(const invalid of [[scope[key]],{toString(){return scope[key];}},new String(scope[key])]){
   const db=fixture();let networkCalls=0;
   await assert.rejects(()=>pullAndApplyNextSyncBatch({
    db,scope:{...scope,[key]:invalid},baseUrl:endpoint,authorization:"Bearer "+"a".repeat(64),
    publicKey,applyEvent:async()=>true,fetchImpl:async()=>{networkCalls++;return response(signedBatch());}
   }),/SYNC_INVALID_PULL_SCOPE/);
   assert.deepEqual(db.calls,[],"invalid scope must not query the cursor");
   assert.equal(networkCalls,0,"invalid scope must not reach the network");
  }
 }
});

test("pull without a local business adapter never reads cursor or contacts cloud",async()=>{
 const db=fixture();let networkCalls=0;
 await assert.rejects(()=>pullAndApplyNextSyncBatch({
  db,scope,baseUrl:endpoint,authorization:"Bearer "+"a".repeat(64),publicKey,
  fetchImpl:async()=>{networkCalls++;return response(signedBatch());}
 }),/SYNC_LOCAL_ADAPTER_REQUIRED/);
 assert.deepEqual(db.calls,[],"no cursor read or transaction before adapter preflight");
 assert.equal(networkCalls,0,"no cloud request without local adapter");
});
test("pull without a transactional database never reads cursor or contacts cloud",async()=>{
 const db=fixture();delete db.beginTransaction;let networkCalls=0;
 await assert.rejects(()=>pullAndApplyNextSyncBatch({
  db,scope,baseUrl:endpoint,authorization:"Bearer "+"a".repeat(64),publicKey,
  applyEvent:async()=>true,fetchImpl:async()=>{networkCalls++;return response(signedBatch());}
 }),/SYNC_TRANSACTION_REQUIRED/);
 assert.deepEqual(db.calls,[],"no cursor read without transaction support");
 assert.equal(networkCalls,0,"no cloud request without transaction support");
});

test("pull rejects missing, malformed and wrong-type pinned server keys before cursor read or network",async()=>{
 const wrongType=generateKeyPairSync("ec",{namedCurve:"prime256v1"}).publicKey.export({type:"spki",format:"pem"});
 for(const untrusted of [undefined,"not-a-public-key",wrongType]){
  const db=fixture();let networkCalls=0,localWrites=0;
  await assert.rejects(()=>pullAndApplyNextSyncBatch({
   db,scope,baseUrl:endpoint,authorization:"Bearer "+"a".repeat(64),publicKey:untrusted,
   applyEvent:async()=>{localWrites++;return true;},
   fetchImpl:async()=>{networkCalls++;return response(signedBatch());}
  }),/SYNC_TRUSTED_KEY_REQUIRED/);
  assert.deepEqual(db.calls,[],"invalid server key must not read cursor or open a transaction");
  assert.equal(networkCalls,0,"device bearer must not be sent without a trusted server key");
  assert.equal(localWrites,0);
 }
});
