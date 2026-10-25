/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Node test uses CommonJS transpilation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/api/restaurant/employee-provision/route.ts'), 'utf8');
const limitedSource = fs.readFileSync(path.join(root, 'lib/security/limited-json.ts'), 'utf8');
const compile = code => ts.transpileModule(code, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const limitedModule = {exports:{}};
new Function('module','exports',compile(limitedSource))(limitedModule,limitedModule.exports);
const readLimitedJson = limitedModule.exports.readLimitedJson;
const start = source.indexOf('const MAX_EMPLOYEE_BODY_BYTES=');
const end = source.indexOf('export async function POST(', start);
assert.ok(start >= 0 && end > start, 'provisioning helper must exist before POST');
const helperSource = source.slice(start,end);
const {employeePayload,MAX_EMPLOYEE_BODY_BYTES} = new Function('readLimitedJson','NextResponse',compile(helperSource) + '\nreturn {employeePayload,MAX_EMPLOYEE_BODY_BYTES};')(
  readLimitedJson,{json:(body,options={})=>({status:options.status??200,body})}
);
const url = 'https://example.test/api/restaurant/employee-provision';
const req = (body,headers={}) => new Request(url,{method:'POST',body,headers});

test('provisioning accepts a valid small owner-supplied payload',async()=>{
 const input={tenantId:'12345678-1234-1234-1234-123456789abc',resourceId:'12345678-1234-1234-1234-123456789abd',password:'secure-long-password',permissions:['orders.view','pos.view']};
 const result=await employeePayload(req(JSON.stringify(input)));
 assert.equal(result.error,null);assert.deepEqual(result.body,input);
 assert.equal(MAX_EMPLOYEE_BODY_BYTES,16384);
});
test('the exact byte limit is accepted',async()=>{
 const prefix='{"padding":"',suffix='"}';
 const body=prefix+'x'.repeat(MAX_EMPLOYEE_BODY_BYTES-Buffer.byteLength(prefix+suffix))+suffix;
 assert.equal(Buffer.byteLength(body),MAX_EMPLOYEE_BODY_BYTES);
 const result=await employeePayload(req(body));assert.equal(result.error,null);
 assert.equal(result.body.padding.length,MAX_EMPLOYEE_BODY_BYTES-Buffer.byteLength(prefix+suffix));
});
test('over-limit body without Content-Length is rejected with 413',async()=>{
 const result=await employeePayload(req(JSON.stringify({padding:'x'.repeat(20000)})));
 assert.equal(result.error.status,413);assert.equal(result.error.body.code,'BODY_TOO_LARGE');
});
test('chunked over-limit body stops streaming early',async()=>{
 let pulled=0;
 const stream=new ReadableStream({pull(controller){pulled++;controller.enqueue(new Uint8Array(8192));if(pulled===12)controller.close();}});
 const result=await employeePayload(new Request(url,{method:'POST',body:stream,duplex:'half'}));
 assert.equal(result.error.status,413);assert.ok(pulled<12,'reader should cancel before reading all chunks');
});
test('oversized declared Content-Length is rejected before reading',async()=>{
 const result=await employeePayload(req('{}',{'content-length':'16385'}));
 assert.equal(result.error.status,413);assert.equal(result.error.body.code,'BODY_TOO_LARGE');
});
test('malformed length header is rejected with 400',async()=>{
 const result=await employeePayload(req('{}',{'content-length':'not-a-number'}));
 assert.equal(result.error.status,400);assert.equal(result.error.body.code,'INVALID_INPUT');
});
test('malformed JSON and arrays never become staff objects',async()=>{
 assert.deepEqual(await employeePayload(req('{broken')),{body:null,error:null});
 assert.deepEqual(await employeePayload(req('[]')),{body:null,error:null});
 assert.deepEqual(await employeePayload(req('null')),{body:null,error:null});
});
test('UTF-8 bytes, not JavaScript character count, enforce the limit',async()=>{
 const body=JSON.stringify({name:'أ'.repeat(9000)});
 assert.ok(body.length<MAX_EMPLOYEE_BODY_BYTES);
 const result=await employeePayload(req(body));assert.equal(result.error.status,413);
});
test('both POST and PATCH use bounded parsing while origin and tenant guards remain',()=>{
 assert.equal((source.match(/employeePayload\(request\)/g)||[]).length,2);
 assert.doesNotMatch(source,/request\.json\(\)/);
 assert.equal((source.match(/assertSameOrigin\(request\)/g)||[]).length,2);
 assert.equal((source.match(/requireTenantMembership\(actor,tenantId,\["owner","manager"\]/g)||[]).length,2);
 assert.match(source,/requireAdditionalBranchUnlock\(/);
});
