/* eslint-disable @typescript-eslint/no-require-imports -- Node-only regression tests. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const compile=(file)=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const load=(code,requireImpl)=>{const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,requireImpl);return m.exports;};
const limited=load(compile('lib/security/limited-json.ts'),require);
const {readBranchActionBody,MAX_BRANCH_ACTION_BODY_BYTES}=load(compile('lib/restaurant/branch-action-body.ts'),(name)=>{
 if(name==='@/lib/security/limited-json')return limited;
 throw new Error(`Unexpected import ${name}`);
});
const url='https://example.test/api/restaurant/branches';
const request=(body,headers)=>new Request(url,{method:'POST',body,headers});

test('valid branch settings payload remains accepted',async()=>{
 const body={id:'abc',version:'v1',name:'فرع جديد',slug:'new-branch',pin:'123456'};
 assert.deepEqual(await readBranchActionBody(request(JSON.stringify(body))),{body,error:null});
 assert.equal(MAX_BRANCH_ACTION_BODY_BYTES,4096);
});
test('valid branch delivery coordinates remain accepted',async()=>{
 const body={branchId:'b',latitude:24.7136,longitude:46.6753};
 assert.deepEqual(await readBranchActionBody(request(JSON.stringify(body))),{body,error:null});
});
test('exact 4096-byte JSON body is accepted',async()=>{
 const prefix='{"padding":"',suffix='"}';
 const body=prefix+'x'.repeat(MAX_BRANCH_ACTION_BODY_BYTES-Buffer.byteLength(prefix+suffix))+suffix;
 assert.equal(Buffer.byteLength(body),MAX_BRANCH_ACTION_BODY_BYTES);
 const result=await readBranchActionBody(request(body));assert.equal(result.error,null);
});
test('over-limit body without Content-Length returns BODY_TOO_LARGE',async()=>{
 assert.equal((await readBranchActionBody(request(JSON.stringify({padding:'x'.repeat(10000)})))).error,'BODY_TOO_LARGE');
});
test('declared oversize rejected',async()=>{
 assert.equal((await readBranchActionBody(request('{}',{'content-length':'4097'}))).error,'BODY_TOO_LARGE');
});
test('malformed Content-Length rejected',async()=>{
 assert.equal((await readBranchActionBody(request('{}',{'content-length':'wrong'}))).error,'INVALID_INPUT');
});
test('malformed JSON, null, array, and primitive rejected',async()=>{
 for(const data of ['{broken','null','[]','123','"string"'])assert.equal((await readBranchActionBody(request(data))).error,'INVALID_INPUT');
});
test('UTF-8 byte size is enforced for Arabic text',async()=>{
 const data=JSON.stringify({name:'أ'.repeat(2500)});
 assert.ok(data.length<4096);
 assert.equal((await readBranchActionBody(request(data))).error,'BODY_TOO_LARGE');
});
test('chunked oversize stream is rejected before fully consuming stream',async()=>{
 let pulled=0;
 const stream=new ReadableStream({pull(controller){pulled++;controller.enqueue(new Uint8Array(2048));if(pulled===10)controller.close();}});
 const result=await readBranchActionBody(new Request(url,{method:'POST',body:stream,duplex:'half'}));
 assert.equal(result.error,'BODY_TOO_LARGE');assert.ok(pulled<10);
});
