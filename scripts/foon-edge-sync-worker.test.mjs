import test from 'node:test';
import assert from 'node:assert/strict';
import {syncEdgeBatch} from './foon-edge-sync-worker.mjs';
test('offline failure never acknowledges an event',async()=>{let acknowledged=false;const result=await syncEdgeBatch({events:[{seq:1}],deviceId:'device',signingSecret:'unused',send:async()=>{throw Error('offline')},ack:async()=>{acknowledged=true}});assert.equal(result.acked,0);assert.equal(result.retry,1);assert.equal(acknowledged,false)});
test("cloud rejection is preserved as conflict and never acknowledged or resent automatically",async()=>{
 let marked=false,acked=false;
 const result=await syncEdgeBatch({events:[{seq:1}],send:async()=>({status:409,error:"EDGE_CATALOG_PRICE_CHANGED"}),ack:async()=>{acked=true;},conflict:async()=>{marked=true;}});
 assert.equal(result.conflicts,1);assert.equal(result.acked,0);assert.equal(marked,true);assert.equal(acked,false);
 const stopped=await syncEdgeBatch({events:[{seq:1,sync_error:"EDGE_CATALOG_PRICE_CHANGED"}],send:async()=>{throw Error("MUST_NOT_RESEND");},ack:async()=>{acked=true;}});
 assert.equal(stopped.conflicts,1);assert.equal(stopped.retry,0);assert.equal(acked,false);
});
