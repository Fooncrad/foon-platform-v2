const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function loadTs(relative, mocks={}) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const module = {exports:{}};
  new Function('require','module','exports',compiled.outputText)((name)=>{
    if (!(name in mocks)) throw new Error('Unexpected import: '+name);
    return mocks[name];
  },module,module.exports);
  return module.exports;
}
const limited = loadTs('lib/security/limited-json.ts');
const uuid = '12345678-1234-1234-1234-123456789abc';
function setup({user='customer',active=true,employee=false,origin=true,dbError=false}={}){
  const calls=[];
  const route = loadTs('app/api/customer/notifications/route.ts', {
    '@/lib/auth/account-surface': {employeePersonalAccessDenied: async()=>employee?{status:403,body:{code:'EMPLOYEE_DENIED'}}:null},
    'next/server': {NextResponse:{json:(body,opts={})=>({status:opts.status??200,body,headers:opts.headers??{}})}},
    '@/lib/auth/session': {currentUserId:async()=>user},
    '@/lib/db/mysql': {database:()=>({execute:async(sql,params)=>{calls.push({sql,params});if(dbError)throw new Error('DB_DOWN');if(sql.startsWith('SELECT'))return [active?[{id:user}]:[]];return [{affectedRows:1}];}})},
    '@/lib/security/origin': {assertSameOrigin:()=>{if(!origin)throw new Error('CROSS_ORIGIN');}},
    '@/lib/security/limited-json': limited,
  });
  const post=(payload)=>route.POST(new Request('https://example.test/api/customer/notifications',{method:'POST',body:typeof payload==='string'?payload:JSON.stringify(payload)}));
  return {post,calls};
}

test('active customer marks only own notification',async()=>{
  const s=setup();const res=await s.post({id:uuid});
  assert.equal(res.status,200);assert.equal(res.body.ok,true);
  assert.equal(s.calls.length,2);
  assert.match(s.calls[0].sql,/users WHERE id=\? AND status='active'/);
  assert.match(s.calls[1].sql,/WHERE user_id=\? AND EXISTS \(SELECT 1 FROM users WHERE id=\? AND status='active'\) AND id=\?/);
  assert.deepEqual(s.calls[1].params,['customer','customer',uuid]);
  assert.equal(res.headers['Cache-Control'],'private, no-store');
});
test('active customer can mark all own notifications',async()=>{
  const s=setup();const res=await s.post({all:true});
  assert.equal(res.status,200);assert.equal(s.calls.length,2);
  assert.doesNotMatch(s.calls[1].sql,/AND id=\?/);assert.deepEqual(s.calls[1].params,['customer','customer']);
});
test('suspended account cannot update notifications',async()=>{
  const s=setup({active:false});const res=await s.post({id:uuid});
  assert.equal(res.status,401);assert.equal(s.calls.length,1);
});
test('missing session cannot update notifications',async()=>{
  const s=setup({user:null});const res=await s.post({id:uuid});
  assert.equal(res.status,401);assert.equal(s.calls.length,0);
});
test('employee account cannot use customer endpoint',async()=>{
  const s=setup({employee:true});const res=await s.post({id:uuid});
  assert.equal(res.status,403);assert.equal(s.calls.length,0);
});
test('cross-origin request denied',async()=>{
  const s=setup({origin:false});const res=await s.post({id:uuid});
  assert.equal(res.status,403);assert.equal(s.calls.length,0);
});
test('oversized request without Content-Length is rejected before DB',async()=>{
  const s=setup();const res=await s.post(JSON.stringify({id:uuid,padding:'x'.repeat(1500)}));
  assert.equal(res.status,413);assert.equal(res.body.code,'BODY_TOO_LARGE');assert.equal(s.calls.length,0);
});
test('malformed JSON and ambiguous all+id are rejected',async()=>{
  const s=setup();
  assert.equal((await s.post('{broken')).status,400);
  assert.equal((await s.post({all:true,id:uuid})).status,400);
  assert.equal((await s.post({id:uuid,unexpected:1})).status,400);
  assert.equal((await s.post({id:'bad'})).status,400);
  assert.equal(s.calls.length,0);
});
test('DB outage fails closed with 503',async()=>{
  const s=setup({dbError:true});const res=await s.post({id:uuid});
  assert.equal(res.status,503);assert.equal(res.body.code,'NOTIFICATIONS_UNAVAILABLE');
});
test('declared over-limit request returns 413',async()=>{
  const s=setup();const res=await s.post({id:uuid});assert.equal(res.status,200);
  const route=loadTs('app/api/customer/notifications/route.ts',{
    '@/lib/auth/account-surface':{employeePersonalAccessDenied:async()=>null},
    'next/server':{NextResponse:{json:(body,opts={})=>({status:opts.status??200,body})}},
    '@/lib/auth/session':{currentUserId:async()=> 'customer'},
    '@/lib/db/mysql':{database:()=>{throw new Error('should not connect')}},
    '@/lib/security/origin':{assertSameOrigin:()=>{}},
    '@/lib/security/limited-json':limited,
  });
  const req=new Request('https://example.test',{method:'POST',headers:{'content-length':'2000'},body:'{}'});
  const response=await route.POST(req);assert.equal(response.status,413);
});
