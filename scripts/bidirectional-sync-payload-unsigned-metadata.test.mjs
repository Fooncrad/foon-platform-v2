import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChangeEnvelope,digestChange} from '../lib/platform/bidirectional-sync-contract.mjs';

const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
function change(payload){return {eventId:ids[0],tenantId:ids[1],branchId:ids[2],actorId:ids[3],entityId:ids[0],entityType:'catalog_item',operation:'upsert',baseVersion:0,timestamp:'2026-10-23T12:00:00Z',payload};}
function rejects(payload){assert.throws(()=>validateChangeEnvelope(change(payload)),/SYNC_INVALID_PAYLOAD/);}
test('ordinary nested JSON payload remains valid and deterministic',()=>{
 const data=change({options:[{name:'coffee',price:12},null,1,true]});
 assert.deepEqual(validateChangeEnvelope(data).payload,data.payload);
 assert.equal(digestChange(data),digestChange(data));
});
test('reject unsigned custom array property even when JSON digest is unchanged',()=>{
 const payload={options:[{id:1}]};const original=digestChange(change(payload));
 payload.options.secret='unsigned';
 assert.equal(digestChange(change({options:[{id:1}]})),original);
 rejects(payload);
});
test('reject symbol-keyed array metadata',()=>{const arr=[1];arr[Symbol('hidden')]='private';rejects({arr});});
test('reject sparse arrays',()=>{const arr=[];arr.length=2;arr[1]=1;rejects({arr});});
test('reject non-enumerable array metadata',()=>{const arr=[1];Object.defineProperty(arr,'secret',{value:'private'});rejects({arr});});
test('reject array index accessor without executing it',()=>{const arr=[1];let called=false;Object.defineProperty(arr,'0',{get(){called=true;return 1},enumerable:true});rejects({arr});assert.equal(called,false);});
test('reject nested object symbol-keyed metadata',()=>{const nested={x:1};nested[Symbol('secret')]='private';rejects({nested});});
test('reject nested object non-enumerable metadata',()=>{const nested={x:1};Object.defineProperty(nested,'secret',{value:'private'});rejects({nested});});
test('reject nested object accessor without executing it',()=>{const nested={};let called=false;Object.defineProperty(nested,'secret',{get(){called=true;return 'private'},enumerable:true});rejects({nested});assert.equal(called,false);});
test('reject prototype-pollution keys in nested JSON objects',()=>{rejects(JSON.parse('{"nested":{"__proto__":{"admin":true}}}'));});
