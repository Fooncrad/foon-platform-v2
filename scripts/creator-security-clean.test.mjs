import test from 'node:test';
import assert from 'node:assert/strict';
import {readCreatorMutationJson} from '../lib/creator/request-body.ts';
import {creatorWriteAccess} from '../lib/creator/write-access.ts';
const make=(body,headers={})=>new Request('https://foon.test/api/account/creator-profile',{method:'POST',headers,body});

test('creator valid body is unchanged',async()=>{
 const body={handle:'sample-creator',displayName:'اسم صانع المحتوى',bio:'وصف',visibility:'private'};
 assert.deepEqual(await readCreatorMutationJson(make(JSON.stringify(body)),8192),{body,error:null});
});
test('max-length Arabic profile fits byte budget',async()=>{
 const body={handle:'sample-creator',displayName:'ع'.repeat(180),bio:'ع'.repeat(1500),visibility:'private'};
 assert.equal((await readCreatorMutationJson(make(JSON.stringify(body)),8192)).error,null);
});
test('declared oversized body rejected before reading',async()=>{
 assert.deepEqual((await readCreatorMutationJson(make('{}',{'content-length':'8193'}),8192)).error,{code:'BODY_TOO_LARGE',status:413});
});
test('chunked oversized body rejected',async()=>{
 const bytes=new TextEncoder().encode('{"bio":"'+'x'.repeat(9000)+'"}');
 const stream=new ReadableStream({start(c){c.enqueue(bytes.subarray(0,1000));c.enqueue(bytes.subarray(1000));c.close();}});
 const req=new Request('https://foon.test/creator',{method:'POST',duplex:'half',body:stream});
 assert.deepEqual((await readCreatorMutationJson(req,8192)).error,{code:'BODY_TOO_LARGE',status:413});
});
test('malformed content-length rejected',async()=>{
 assert.deepEqual((await readCreatorMutationJson(make('{}',{'content-length':'bad'}),8192)).error,{code:'INVALID_INPUT',status:400});
});
test('malformed JSON remains invalid input for parser',async()=>{
 assert.deepEqual(await readCreatorMutationJson(make('{bad'),8192),{body:null,error:null});
});
test('exact byte limit allowed',async()=>{
 const raw='{"id":"1"}';
 assert.deepEqual(await readCreatorMutationJson(make(raw+' '.repeat(512-Buffer.byteLength(raw))),512),{body:{id:'1'},error:null});
});
test('portfolio and social have distinct limits',async()=>{
 assert.equal((await readCreatorMutationJson(make(JSON.stringify({caption:'ع'.repeat(240)})),2048)).error,null);
 assert.deepEqual((await readCreatorMutationJson(make('x'.repeat(32769)),32768)).error,{code:'BODY_TOO_LARGE',status:413});
});
const id='customer-a';
function mock(users,roles){const calls=[];return {calls,execute:async(sql,params)=>{calls.push({sql,params});return [calls.length===1?users:roles]}};}
test('active customer passes with parameterized account scope',async()=>{
 const db=mock([{id}],[]);
 assert.equal(await creatorWriteAccess(db,id),'active');
 assert.match(db.calls[0].sql,/status='active' FOR UPDATE/);
 assert.match(db.calls[1].sql,/FROM memberships WHERE user_id=\\?/);
 assert.match(db.calls[1].sql,/FROM platform_admins WHERE user_id=\\?/);
 assert.deepEqual(db.calls.map(x=>x.params),[[id],[id,id]]);
});
test('suspended or deleted customer blocked before role lookup',async()=>{
 const db=mock([],[]);
 assert.equal(await creatorWriteAccess(db,id),'inactive');
 assert.equal(db.calls.length,1);
});
test('merchant or platform admin identity disqualified',async()=>{
 for(const row of [[{membership:1}],[{platformAdmin:1}]]){
  assert.equal(await creatorWriteAccess(mock([{id}],row),id),'disqualified');
 }
});
test('no unscoped identity query',async()=>{
 const db=mock([{id}],[]);await creatorWriteAccess(db,id);
 assert.equal(db.calls.every(c=>c.params.every(p=>p===id)),true);
});
