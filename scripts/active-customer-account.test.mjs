import test from 'node:test';
import assert from 'node:assert/strict';
import {activeCustomerAccount} from '../lib/auth/active-customer-account.mjs';

const makeDb = (rows) => ({
  calls: [],
  async execute(sql, params) { this.calls.push({sql, params}); return [rows]; }
});

test('active customer is accepted with parameterized query', async () => {
  const db = makeDb([{id:'customer-a'}]);
  assert.equal(await activeCustomerAccount(db, 'customer-a'), true);
  assert.deepEqual(db.calls[0].params, ['customer-a']);
  assert.match(db.calls[0].sql, /status='active'/);
  assert.doesNotMatch(db.calls[0].sql, /FOR UPDATE/);
});
test('suspended or missing customer is denied', async () => {
  const db = makeDb([]);
  assert.equal(await activeCustomerAccount(db, 'suspended'), false);
  assert.equal(await activeCustomerAccount(db, 'deleted'), false);
});
test('tenant enrollment locks active customer account before write', async () => {
  const db = makeDb([{id:'customer-a'}]);
  assert.equal(await activeCustomerAccount(db, 'customer-a', true), true);
  assert.match(db.calls[0].sql, /FOR UPDATE$/);
});
test('empty identifiers are denied without querying', async () => {
  const db = makeDb([{id:'customer-a'}]);
  assert.equal(await activeCustomerAccount(db, ''), false);
  assert.equal(await activeCustomerAccount(db, null), false);
  assert.equal(db.calls.length, 0);
});
test('database errors propagate so callers can fail closed with 503', async () => {
  const db = {async execute() {throw new Error('db offline');}};
  await assert.rejects(activeCustomerAccount(db, 'customer-a'), /db offline/);
});

// Protect route wiring as well as the helper: a passing helper unit test alone
// cannot detect a future route that forgets to call it.
test('customer GET routes retain active-user gate before data reads', async () => {
  const {readFile} = await import('node:fs/promises');
  for (const route of ['services', 'service-requests', 'order-revision']) {
    const source = await readFile(new URL(`../app/api/customer/${route}/route.ts`, import.meta.url), 'utf8');
    const get = source.split('export async function GET')[1]?.split('export async function POST')[0] ?? '';
    assert.match(get, /if\(!await activeCustomerAccount\(/, route);
  }
});
test('customer store enrollment locks active user before creating tenant links', async () => {
  const {readFile} = await import('node:fs/promises');
  const source = await readFile(new URL('../app/api/customer/join-store/route.ts', import.meta.url), 'utf8');
  const transaction = source.indexOf('await connection.beginTransaction()');
  const gate = source.indexOf('activeCustomerAccount(connection,userId,true)');
  const insert = source.indexOf('INSERT IGNORE INTO tenant_customers');
  assert.ok(transaction >= 0 && gate > transaction && insert > gate);
});

// Exercise the actual GET route handlers, transpiled with project TypeScript,
// against controlled session/database dependencies (no production connections).
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

async function customerReadRoute(route, {active=true, user='customer-a', employee=false, store=true, failDb=false}={}) {
  const calls=[];
  const db={
    async execute(sql,params){
      calls.push({sql,params});
      if(failDb)throw new Error('db unavailable');
      if(sql.includes('FROM users WHERE id=?'))return [active?[{id:user}]:[]];
      if(sql.includes('FROM restaurant_customer_invoices'))return [[{id:'invoice-a',invoice_json:'{"items":[]}',order_id:'order-a'}]];
      if(sql.includes('FROM tenants t JOIN tenant_business_profiles'))return [store?[{id:'tenant-a',country_code:'SA',activity_code:'fashion'}]:[]];
      if(sql.includes('FROM customer_delivery_addresses'))return [[{country_code:'SA',city:'Riyadh',district:'Central',street_address:'Street',delivery_notes:'',latitude:null,longitude:null,phone:'0500000000'}]];
      if(sql.includes('FROM branches b'))return [[{id:'branch-a',name:'Main',latitude:null,longitude:null}]];
      throw new Error('Unexpected query: '+sql);
    }
  };
  const mocks={
    'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200,headers:options.headers??{}})}},
    '@/lib/auth/account-surface':{employeePersonalAccessDenied:async()=>employee?{status:403,body:{code:'FORBIDDEN'}}:null},
    '@/lib/auth/session':{currentUserId:async()=>user},
    '@/lib/db/mysql':{database:()=>db},
    '@/lib/auth/active-customer-account.mjs':{activeCustomerAccount},
    '@/lib/tenant/delivery-address-sync':{addressFromStoredFields:(street)=>street},
    '@/lib/tenant/nearest-delivery-branch.mjs':{nearestDeliveryBranch:()=>null},
    '@/lib/tenant/international-shipping':{allowedDeliveryCountries:async()=>['SA']}
  };
  const source=await readFile(new URL('../app/api/customer/'+route+'/route.ts',import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{}};
  new Function('require','module','exports',js)((id)=>{if(!(id in mocks))throw new Error('Unexpected import '+id);return mocks[id];},mod,mod.exports);
  return {response:await mod.exports.GET(new Request('https://example.test/api/customer/delivery-preferences?storeSlug=store-a')),calls};
}

test('invoice archive: active customer sees only scoped invoices',async()=>{
  const {response,calls}=await customerReadRoute('invoices');
  assert.equal(response.status,200);
  assert.equal(response.body.invoices[0].id,'invoice-a');
  const invoice=calls.find(c=>c.sql.includes('FROM restaurant_customer_invoices'));
  assert.deepEqual(invoice.params,['customer-a','customer-a']);
  assert.match(invoice.sql,/JOIN users u ON u\.id=i\.customer_user_id AND u\.status='active'/);
  assert.match(invoice.sql,/o\.tenant_id=i\.tenant_id/);
  assert.match(invoice.sql,/t\.status='active'/);
});
test('invoice archive: suspended customer cannot read invoices',async()=>{
  const {response,calls}=await customerReadRoute('invoices',{active:false});
  assert.equal(response.status,401);
  assert.equal(response.headers['Cache-Control'],'no-store');
  assert.equal(calls.some(c=>c.sql.includes('FROM restaurant_customer_invoices')),false);
});
test('invoice archive: database verification failure is 503',async()=>{
  const {response}=await customerReadRoute('invoices',{failDb:true});
  assert.equal(response.status,503);
});
test('invoice archive: staff and unauthenticated sessions are rejected',async()=>{
  assert.equal((await customerReadRoute('invoices',{employee:true})).response.status,403);
  assert.equal((await customerReadRoute('invoices',{user:null})).response.status,401);
});
test('delivery preferences: active customer reads only linked store and country',async()=>{
  const {response,calls}=await customerReadRoute('delivery-preferences');
  assert.equal(response.status,200);
  assert.equal(response.body.address.countryCode,'SA');
  const tenant=calls.find(c=>c.sql.includes('FROM tenants t JOIN tenant_business_profiles'));
  assert.deepEqual(tenant.params,['customer-a','store-a']);
  assert.match(tenant.sql,/JOIN users u ON u\.id=c\.user_id AND u\.status='active'/);
  const addresses=calls.find(c=>c.sql.includes('FROM customer_delivery_addresses'));
  assert.deepEqual(addresses.params,['customer-a','SA']);
  assert.match(calls.find(c=>c.sql.includes('FROM branches b')).sql,/b\.tenant_id=\?/);
});
test('delivery preferences: suspended customer cannot read addresses or branches',async()=>{
  const {response,calls}=await customerReadRoute('delivery-preferences',{active:false});
  assert.equal(response.status,401);
  assert.equal(response.headers['Cache-Control'],'no-store');
  assert.equal(calls.some(c=>c.sql.includes('FROM tenants t JOIN tenant_business_profiles')),false);
});
test('delivery preferences: missing store membership cannot read private data',async()=>{
  const {response,calls}=await customerReadRoute('delivery-preferences',{store:false});
  assert.equal(response.status,403);
  assert.equal(calls.some(c=>c.sql.includes('FROM customer_delivery_addresses')),false);
  assert.equal(calls.some(c=>c.sql.includes('FROM branches b')),false);
});
test('delivery preferences: database failure and staff sessions fail closed',async()=>{
  assert.equal((await customerReadRoute('delivery-preferences',{failDb:true})).response.status,503);
  assert.equal((await customerReadRoute('delivery-preferences',{employee:true})).response.status,403);
});

// Both write endpoints must reject oversized/chunked bodies before reaching MySQL.
test('oversized customer service bodies fail before database access', async () => {
  const {readLimitedJson} = await import('../lib/security/limited-json.ts');
  for (const routeName of ['services', 'service-requests']) {
    const source = await readFile(new URL('../app/api/customer/'+routeName+'/route.ts', import.meta.url), 'utf8');
    assert.match(source, /readLimitedJson\(request,16384\)/, routeName);
    assert.doesNotMatch(source.split('export async function POST')[1], /request\.json\(/, routeName);
    const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const mocks = {
      'next/server': {NextResponse:{json:(body,options={})=>({body,status:options.status??200})}},
      '@/lib/auth/account-surface': {employeePersonalAccessDenied:async()=>null},
      '@/lib/auth/session': {currentUserId:async()=> 'customer-a'},
      '@/lib/security/origin': {assertSameOrigin:()=>{}},
      '@/lib/security/limited-json': {readLimitedJson},
      '@/lib/db/mysql': {database:()=>{throw new Error('DB must not be accessed');}}
    };
    const cjsModule = {exports:{}};
    new Function('require','module','exports',js)((id)=>mocks[id]??{},cjsModule,cjsModule.exports);
    const handler = cjsModule.exports.POST;
    const oversized = await handler(new Request('https://example.test/api/customer/'+routeName,{method:'POST',body:'x'.repeat(17000)}));
    assert.equal(oversized.status,413,routeName);
    assert.equal(oversized.body.code,'BODY_TOO_LARGE',routeName);
    const malformed = await handler(new Request('https://example.test/api/customer/'+routeName,{method:'POST',body:'{bad'}));
    assert.equal(malformed.status,400,routeName);
  }
});
