import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Isolated execution of route access functions with auth/DB/PIN mocked.
// This is not an HTTP, Next.js, or MariaDB integration test.
const routes=['app/api/restaurant/floor-plan/route.ts','app/api/restaurant/floor-plan-layouts/route.ts'];
function accessFunction(path,options={}){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const name=path.includes('floor-plan-layouts')?'scope':'access';
 const start=source.indexOf('async function '+name+'(');
 assert.ok(start>=0,'access function exists');
 const end=source.indexOf('\n}\n',start);
 assert.ok(end>start,'access function boundary exists');
 const code=source.slice(start,end+2)
  .replace('req:Request,write:boolean','req,write')
  .replaceAll('execute<RowDataPacket[]>','execute');
 class BranchPinError extends Error{constructor(code){super(code);this.code=code}}
 const calls={pin:0,all:0,queries:[]};
 const membership=options.membership??{tenantId:'tenant-1',role:'manager',adminAccess:false};
 const fn=new Function('currentUserId','NextResponse','requireTenantMembership','requireAllAdditionalBranchesUnlocked','requireAdditionalBranchUnlock','database','BranchPinError','return ('+code+')')(
  async()=>options.user===undefined?'staff-1':options.user,
  {json:(body,init)=>({body,status:init?.status})},
  async()=>{if(options.denied)throw Error('FORBIDDEN');return membership},
  async()=>{calls.all++;if(options.allDenied)throw new BranchPinError('BRANCH_PIN_REQUIRED')},
  async(tenant,branch,user)=>{calls.pin++;assert.equal(tenant,'tenant-1');assert.equal(branch,'branch-2');assert.equal(user,'staff-1');if(options.pinDenied)throw new BranchPinError(options.pinDenied)},
  ()=>({execute:async(sql,args)=>{calls.queries.push({sql,args});return [options.branchExists===false?[]:[{id:'branch-2'}]]}}),
  BranchPinError
 );
 const request={url:'https://example.invalid/api?branch=branch-2',headers:{get:()=> 'tenant-1'}};
 return {fn,calls,request};
}
for(const route of routes){
 test(route+' denies locked branch read with actionable PIN code',async()=>{
  const {fn,calls,request}=accessFunction(route,{pinDenied:'BRANCH_PIN_REQUIRED'});
  const result=await fn(request,false);
  assert.equal(result.error?.status,403);
  assert.equal(result.error?.body?.code,'BRANCH_PIN_REQUIRED');
  assert.equal(calls.pin,1);
  assert.equal(calls.all,0);
 });
 test(route+' permits unlocked tenant branch read',async()=>{
  const {fn,calls,request}=accessFunction(route);
  const result=await fn(request,false);
  assert.deepEqual(result,{tenant:'tenant-1',branch:'branch-2'});
  assert.equal(calls.pin,1);
 });
 test(route+' preserves explicit platform admin read and PIN-gates support',async()=>{
  const admin=accessFunction(route,{membership:{tenantId:'tenant-1',role:'owner',adminAccess:true,platformRole:'admin'},pinDenied:'BRANCH_PIN_REQUIRED'});
  assert.equal((await admin.fn(admin.request,false)).branch,'branch-2');
  assert.equal(admin.calls.pin,0);
  const support=accessFunction(route,{membership:{tenantId:'tenant-1',role:'manager',adminAccess:true,platformRole:'support'},pinDenied:'BRANCH_PIN_REQUIRED'});
  assert.equal((await support.fn(support.request,false)).error?.body?.code,'BRANCH_PIN_REQUIRED');
  assert.equal(support.calls.pin,1);
 });
 test(route+' preserves existing all-branches PIN policy on writes',async()=>{
  const {fn,calls,request}=accessFunction(route);
  assert.equal((await fn(request,true)).branch,'branch-2');
  assert.equal(calls.all,1);
  assert.equal(calls.pin,0);
 });
 test(route+' rejects nonmember before branch/PIN read',async()=>{
  const {fn,calls,request}=accessFunction(route,{denied:true});
  assert.equal((await fn(request,false)).error?.status,403);
  assert.equal(calls.pin,0);
  assert.equal(calls.queries.length,0);
 });
 test(route+' rejects nonexistent branch before PIN lookup',async()=>{
  const {fn,calls,request}=accessFunction(route,{branchExists:false});
  assert.equal((await fn(request,false)).error?.body?.code,'BRANCH_NOT_FOUND');
  assert.equal(calls.pin,0);
 });
 test(route+' rejects anonymous requests before DB access',async()=>{
  const {fn,calls,request}=accessFunction(route,{user:null});
  assert.equal((await fn(request,false)).error?.status,401);
  assert.equal(calls.queries.length,0);
 });
}
