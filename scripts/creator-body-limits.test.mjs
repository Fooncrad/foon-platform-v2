import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCreatorMutationJson} from '../lib/creator/request-body.ts';

const make=(body,headers={})=>new Request('https://foon.test/account/creator',{method:'POST',headers,body});

test('small valid JSON preserves creator profile fields',async()=>{
 const draft={handle:'my-creator',displayName:'اسم صانع المحتوى',bio:'وصف',visibility:'private'};
 assert.deepEqual(await readCreatorMutationJson(make(JSON.stringify(draft)),8192),{body:draft,error:null});
});
test('valid Arabic creator biography at maximum character length fits the UTF-8 budget',async()=>{
 const draft={handle:'my-creator',displayName:'ع'.repeat(180),bio:'ع'.repeat(1500),visibility:'private'};
 assert.deepEqual((await readCreatorMutationJson(make(JSON.stringify(draft)),8192)).error,null);
});
test('declared oversized content length returns 413 before body consumption',async()=>{
 assert.deepEqual((await readCreatorMutationJson(make('{}',{'content-length':'8193'}),8192)).error,{code:'BODY_TOO_LARGE',status:413});
});
test('streamed chunked oversized JSON returns 413 without Content-Length',async()=>{
 const bytes=new TextEncoder().encode('{"bio":"'+'x'.repeat(10000)+'"}');
 const stream=new ReadableStream({start(c){c.enqueue(bytes.subarray(0,1000));c.enqueue(bytes.subarray(1000));c.close();}});
 const req=new Request('https://foon.test/account/creator',{method:'POST',duplex:'half',body:stream});
 assert.deepEqual((await readCreatorMutationJson(req,8192)).error,{code:'BODY_TOO_LARGE',status:413});
});
test('malformed content length returns 400',async()=>{
 assert.deepEqual((await readCreatorMutationJson(make('{}',{'content-length':'abc'}),8192)).error,{code:'INVALID_INPUT',status:400});
});
test('malformed JSON leaves existing input validation to reject',async()=>{
 assert.deepEqual(await readCreatorMutationJson(make('{bad'),8192),{body:null,error:null});
});
test('exact byte limit is accepted',async()=>{
 const raw='{"id":"1"}';const max=512;
 assert.deepEqual(await readCreatorMutationJson(make(raw+' '.repeat(max-Buffer.byteLength(raw))),max),{body:{id:'1'},error:null});
});
test('portfolio and social body caps are independently enforced',async()=>{
 assert.equal((await readCreatorMutationJson(make(JSON.stringify({caption:'ع'.repeat(240)})),2048)).error,null);
 assert.deepEqual((await readCreatorMutationJson(make('x'.repeat(32769)),32768)).error,{code:'BODY_TOO_LARGE',status:413});
});
test('all creator profile and social writes enforce byte caps after origin and account authorization',()=>{
 const profile=readFileSync(new URL('../app/api/account/creator-profile/route.ts',import.meta.url),'utf8');
 const social=readFileSync(new URL('../app/api/account/creator-social-links/route.ts',import.meta.url),'utf8');
 for(const [method,cap] of [['PUT',8192],['POST',2048],['DELETE',512]]){
  const segment=profile.split('export async function '+method+'(request:Request){')[1];
  assert.ok(segment,method+' exists');
  const beforeDb=segment.split('const db=await database().getConnection();')[0];
  assert.match(beforeDb,/assertSameOrigin\(request\)/);
  assert.match(beforeDb,/scope\(\)/);
  assert.match(beforeDb,new RegExp('readCreatorMutationJson\\(request,'+cap+'\\)'));
 }
 const socialPut=social.split('export async function PUT(request:Request){')[1];
 assert.match(socialPut,/assertSameOrigin\(request\)/);
 assert.match(socialPut,/actor\(\)/);
 assert.match(socialPut,/readCreatorMutationJson\(request,32768\)/);
 assert.doesNotMatch(profile,/request\.json\(/);
 assert.doesNotMatch(social,/request\.json\(/);
});
