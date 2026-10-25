const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const repo = path.resolve(__dirname, '..');
const routeText = fs.readFileSync(path.join(repo, 'app/api/customer/service-requests/route.ts'), 'utf8');
const readerText = fs.readFileSync(path.join(repo, 'lib/security/limited-json.ts'), 'utf8');
const transpile = (src) => ts.transpileModule(src, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
function moduleFrom(source, mockedRequire) {
  const mod = {exports: {}};
  new Function('require', 'module', 'exports', transpile(source))(mockedRequire, mod, mod.exports);
  return mod.exports;
}
const {readLimitedJson} = moduleFrom(readerText, require);
const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
function harness({active=true, deny=false, user=userId, afterScope, databaseFailure=false}={}) {
  const calls = [];
  let accountActive = active;
  let resourceReads = 0;
  const db = {
    async execute(sql, params) {
      calls.push({sql,params});
      if (databaseFailure) throw new Error('database down');
      if (sql.includes('SELECT t.id,p.activity_code FROM tenants')) {
        assert.match(sql, /JOIN users u ON u\.id=c\.user_id AND u\.status='active'/);
        assert.deepEqual(params, [userId, 'salon-a']);
        if (!accountActive) return [[]];
        if (afterScope) accountActive = false;
        return [[{id: tenantId, activity_code: 'salon'}]];
      }
      if (sql.includes("kind='service_customer_request'")) {
        resourceReads++;
        assert.match(sql, /AND EXISTS \(SELECT 1 FROM users WHERE id=\? AND status='active'\)/);
        assert.deepEqual(params, [tenantId, userId, userId]);
        if (!accountActive) return [[]];
        return [[{id: 'request-1',name:'مساعدة',status:'pending',data:JSON.stringify({requestType:'inquiry',scheduledAt:null,customerPhone:'SECRET'}),created_at:'today',updated_at:'today'}]];
      }
      throw new Error('unexpected query: '+sql);
    },
    async getConnection(){throw new Error('POST must not reach database for invalid input');}
  };
  const mockRequire = (name) => {
    if (name === 'node:crypto') return require(name);
    if (name === 'next/server') return {NextResponse: {json: (data, opts={}) => ({status:opts.status??200,body:data,headers:opts.headers??{}})}};
    if (name === '@/lib/auth/session') return {currentUserId: async()=>user};
    if (name === '@/lib/auth/account-surface') return {employeePersonalAccessDenied:async()=>deny?{status:403,body:{code:'EMPLOYEE_OPERATIONAL_ACCESS_ONLY'}}:null};
    if (name === '@/lib/db/mysql') return {database:()=>db};
    if (name === '@/lib/security/limited-json') return {readLimitedJson};
    if (name === '@/lib/security/origin') return {assertSameOrigin:()=>{}};
    if (name === '@/scripts/store-slug.mjs') return {validStoreSlug:(slug)=>slug==='salon-a'};
    if (name === '@/lib/platform/service-request-policy') return {
      SERVICE_BUSINESSES:new Set(['salon']),serviceRequestTypeAllowed:()=>true,validServiceAppointmentTime:()=>true,validServiceRequestPhone:(x)=>typeof x==='string'&&x.length>6
    };
    if (name === '@/lib/plans/entitlements') return {tenantEntitlement:async()=>({enabled:true})};
    if (name === '@/lib/tenant/public-controls') return {tenantPublicControls:async()=>({}),publicControlAllowed:()=>true};
    if (name === '@/lib/notifications/customer') return {notifyCustomer:async()=>{}};
    if (name === '@/lib/notifications/dispatch') return {dispatchNotifications:()=>{}};
    throw new Error('unmocked import: '+name);
  };
  return {...moduleFrom(routeText,mockRequire),calls,getResourceReads:()=>resourceReads};
}
function postRequest(body, headers={}) {
  return new Request('https://nfoodz.com/api/customer/service-requests', {method:'POST',headers,body,duplex:'half'});
}
function chunked(text) {
  const bytes=new TextEncoder().encode(text);
  return new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=128)controller.enqueue(bytes.slice(i,i+128));controller.close();}});
}
const getReq=()=>new Request('https://nfoodz.com/api/customer/service-requests?storeSlug=salon-a');
test('active linked customer sees only own tenant-scoped sanitized service requests',async()=>{
  const h=harness();const result=await h.GET(getReq());
  assert.equal(result.status,200);assert.equal(result.body.requests.length,1);
  assert.equal(result.body.requests[0].requestType,'inquiry');
  assert.equal('customerPhone' in result.body.requests[0],false);
  assert.equal(h.getResourceReads(),1);
});
test('suspended customer session is denied before reading service requests',async()=>{
  const h=harness({active:false});const result=await h.GET(getReq());
  assert.equal(result.status,403);assert.equal(h.getResourceReads(),0);
});
test('suspension between tenant lookup and resource query returns no data',async()=>{
  const h=harness({afterScope:true});const result=await h.GET(getReq());
  assert.equal(result.status,200);assert.deepEqual(result.body.requests,[]);
});
test('employee accounts cannot read customer service requests',async()=>{
  const h=harness({deny:true});const result=await h.GET(getReq());
  assert.equal(result.status,403);assert.equal(h.calls.length,0);
});
test('unauthenticated customer cannot read service requests',async()=>{
  const h=harness({user:null});const result=await h.GET(getReq());
  assert.equal(result.status,401);assert.equal(h.calls.length,0);
});
test('GET fails closed on database outage',async()=>{
  const h=harness({databaseFailure:true});const result=await h.GET(getReq());assert.equal(result.status,503);
});
test('POST rejects chunked JSON over 4096 bytes before DB access',async()=>{
  const h=harness();const result=await h.POST(postRequest(chunked(JSON.stringify({storeSlug:'salon-a',notes:'x'.repeat(5000)}))));
  assert.equal(result.status,413);assert.equal(result.body.code,'BODY_TOO_LARGE');assert.equal(h.calls.length,0);
});
test('POST rejects declared oversize and invalid length before DB access',async()=>{
  const h=harness();
  for(const [header,status] of [['5000',413],['invalid',400]]){
    const result=await h.POST(postRequest('{}',{'content-length':header}));assert.equal(result.status,status);
  }
  assert.equal(h.calls.length,0);
});
test('POST rejects malformed, empty, and array JSON before DB access',async()=>{
  const h=harness();for(const body of ['{','', '[]']){
    const result=await h.POST(postRequest(body));assert.equal(result.status,400);
  }assert.equal(h.calls.length,0);
});
test('POST rejects incomplete small JSON before DB access',async()=>{
  const h=harness();const result=await h.POST(postRequest('{"storeSlug":"salon-a"}'));
  assert.equal(result.status,400);assert.equal(h.calls.length,0);
});
test('reader counts UTF-8 bytes rather than character count',async()=>{
  const h=harness();const result=await h.POST(postRequest(JSON.stringify({notes:'مرحبا'.repeat(700)})));
  assert.equal(result.status,413);assert.equal(result.body.code,'BODY_TOO_LARGE');
});
test('source no longer calls unbounded request.json and retains customer identity predicates',()=>{
  assert.doesNotMatch(routeText,/request\.json\(\)/);
  assert.match(routeText,/readLimitedJson\(request,4096\)/);
  assert.match(routeText,/customerUserId/);
  assert.match(routeText,/tenant_id=\?/);
});
