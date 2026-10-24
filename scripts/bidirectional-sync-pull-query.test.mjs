import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSyncPullQuery} from '../lib/platform/bidirectional-sync-pull-query.mjs';
const tenantId='11111111-1111-4111-8111-111111111111';
const branchId='22222222-2222-4222-8222-222222222222';
const valid=new URLSearchParams({tenantId,branchId,after:'0',limit:'100'});
const parse=(query)=>parseSyncPullQuery(new URLSearchParams(query));
const rejects=(query)=>assert.throws(()=>parse(query),/SYNC_INVALID_PULL_QUERY/);

test('accepts exact scoped client query',()=>{
 assert.deepEqual(parseSyncPullQuery(valid),{tenantId,branchId,after:0,limit:100});
});
test('preserves documented cursor and page defaults',()=>{
 assert.deepEqual(parse(new URLSearchParams({tenantId,branchId})),{tenantId,branchId,after:0,limit:100});
});
test('rejects repeated tenantId even if first value is valid',()=>{
 const q=new URLSearchParams(valid);q.append('tenantId','33333333-3333-4333-8333-333333333333');rejects(q);
});
test('rejects repeated branchId even if both values match',()=>{
 const q=new URLSearchParams(valid);q.append('branchId',branchId);rejects(q);
});
test('rejects repeated after or limit to prevent parameter ambiguity',()=>{
 for(const key of ['after','limit']){const q=new URLSearchParams(valid);q.append(key,'1');rejects(q);}
});
test('rejects extra token, redirect and encoded parameter names',()=>{
 for(const key of ['token','redirect','access_token','tenantId%00']){const q=new URLSearchParams(valid);q.append(key,'secret');rejects(q);}
});
test('rejects malformed and missing tenant or branch',()=>{
 for(const key of ['tenantId','branchId']){const q=new URLSearchParams(valid);q.delete(key);rejects(q);const bad=new URLSearchParams(valid);bad.set(key,'not-a-uuid');rejects(bad);}
});
test('rejects noncanonical or negative cursor values',()=>{
 for(const after of ['-1','+1','01','1e2','0x10',' 1 ','1.0','','9007199254740992']){const q=new URLSearchParams(valid);q.set('after',after);rejects(q);}
});
test('rejects out-of-range or malformed limit',()=>{
 for(const limit of ['0','201','-1','01','1e2','NaN','200.0','9007199254740992']){const q=new URLSearchParams(valid);q.set('limit',limit);rejects(q);}
});
test('accepts valid bounds and uppercase UUIDs',()=>{
 const q=new URLSearchParams(valid);q.set('after','9007199254740991');q.set('limit','200');q.set('tenantId',tenantId.toUpperCase());
 assert.equal(parseSyncPullQuery(q).after,Number.MAX_SAFE_INTEGER);
 assert.equal(parseSyncPullQuery(q).limit,200);
});
test('rejects non-URLSearchParams input',()=>{
 for(const value of [null,{},'tenantId=x',new Map()])assert.throws(()=>parseSyncPullQuery(value),/SYNC_INVALID_PULL_QUERY/);
});
