import test from 'node:test';
import assert from 'node:assert/strict';
import {requestSyncJson} from '../lib/platform/bidirectional-sync-transport.mjs';

const authorization='Bearer '+'a'.repeat(64);
const ok={status:200,ok:true,redirected:false,headers:{get:()=> 'application/json'},json:async()=>({ok:true})};

test('reject localhost and internal hosts with a trailing DNS root dot before transmitting bearer', async()=>{
 let calls=0;
 const fetchImpl=async()=>{calls++;return ok;};
 for (const host of ['localhost.','foo.localhost.','internal.','office.internal.','service.local.']) {
  await assert.rejects(()=>requestSyncJson({url:`https://${host}/api/sync/v1/push`,method:'POST',body:{events:[]},authorization,fetchImpl}),/SYNC_UNSAFE_ENDPOINT/,host);
 }
 assert.equal(calls,0,'never transmit bearer to DNS-root-suffixed local hosts');
});

test('reject root-dot hostname variants even when a public hostname is used', async()=>{
 let calls=0;
 await assert.rejects(()=>requestSyncJson({url:'https://sync.example.com./api/sync/v1/push',method:'POST',body:{events:[]},authorization,fetchImpl:async()=>{calls++;return ok;}}),/SYNC_UNSAFE_ENDPOINT/);
 assert.equal(calls,0);
});

test('valid public hostname still sends one authenticated request',async()=>{
 let calls=0;
 const result=await requestSyncJson({url:'https://sync.example.com/api/sync/v1/push',method:'POST',body:{events:[]},authorization,fetchImpl:async()=>{calls++;return ok;}});
 assert.deepEqual(result,{ok:true});assert.equal(calls,1);
});
