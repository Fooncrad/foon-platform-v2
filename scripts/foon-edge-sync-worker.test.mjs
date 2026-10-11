import test from 'node:test';
import assert from 'node:assert/strict';
import {syncEdgeBatch} from './foon-edge-sync-worker.mjs';
test('offline failure never acknowledges an event',async()=>{let acknowledged=false;const result=await syncEdgeBatch({events:[{seq:1}],deviceId:'device',signingSecret:'unused',send:async()=>{throw Error('offline')},ack:async()=>{acknowledged=true}});assert.equal(result.acked,0);assert.equal(result.retry,1);assert.equal(acknowledged,false)});
