/* eslint-disable @typescript-eslint/no-require-imports -- CJS test exercises the real TS route with mocked I/O. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');

function setup({user='customer-a',active=true,employee=false,dbError=false,reservationsError=false,freezeAfterGate=false}={}){
 const source=fs.readFileSync(path.join(__dirname,'../app/api/customer/order-revision/route.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 const calls=[];
 const mocks={
  '@/lib/auth/account-surface':{employeePersonalAccessDenied:async()=>employee?{status:403}:null},
  'next/server':{NextResponse:{json:(body,opts={})=>({status:opts.status??200,body,headers:opts.headers??{}})}},
  'node:crypto':require('node:crypto'),
  '@/lib/auth/session':{currentUserId:async()=>user},
  '@/lib/db/mysql':{database:()=>({execute:async(sql,params)=>{
   calls.push({sql,params});
   if(dbError)throw new Error('DB_UNAVAILABLE');
   if(sql.startsWith('SELECT id FROM users'))return [active?[{id:user}]:[]];
   if(reservationsError&&sql.includes("kind='reservation'"))throw new Error('RESERVATIONS_UNAVAILABLE');
   if(freezeAfterGate)return [sql.includes('COUNT(*)')?[{total:0,unread:0}]:[]];
   if(sql.includes('FROM restaurant_orders'))return [[{id:'order-a',status:'ready',payment_status:'paid',total:50,updated_at:'2026-10-25'}]];
   if(sql.includes("kind='reservation'"))return [[{id:'reservation-a',status:'confirmed',version:2}]];
   if(sql.includes('COUNT(*)'))return [[{total:1,unread:1}]];
   if(sql.includes('FROM customer_notifications'))return [[{id:'notification-a',read_at:null}]];
   throw new Error('Unexpected query '+sql);
  }})}
 };
 const loadedModule={exports:{}};
 new Function('require','module','exports',compiled.outputText)(name=>{
  if(!(name in mocks))throw new Error('Unexpected import '+name);
  return mocks[name];
 },loadedModule,loadedModule.exports);
 return {GET:loadedModule.exports.GET,calls};
}

test('active customer receives own revision and private no-store response',async()=>{
 const s=setup(),r=await s.GET();
 assert.equal(r.status,200);assert.match(r.body.revision,/^[a-f0-9]{64}$/);
 assert.equal(r.body.notificationId,'notification-a');assert.equal(r.body.unread,1);
 assert.equal(r.headers['Cache-Control'],'private, no-store');
 assert.equal(s.calls.length,5);
});
test('frozen or deleted account with valid cookie cannot read activity',async()=>{
 const s=setup({active:false}),r=await s.GET();
 assert.equal(r.status,401);assert.equal(r.body.code,'UNAUTHORIZED');assert.equal(s.calls.length,1);
});
test('missing session and employee accounts are rejected before database queries',async()=>{
 for(const opts of [{user:null},{employee:true}]){
  const s=setup(opts),r=await s.GET();assert.ok([401,403].includes(r.status));assert.equal(s.calls.length,0);
 }
});
test('all activity queries are scoped to the customer and current active status',async()=>{
 const s=setup();await s.GET();
 assert.match(s.calls[0].sql,/users WHERE id=\? AND status='active'/);
 for(const {sql,params} of s.calls.slice(1)){
  assert.match(sql,/EXISTS \(SELECT 1 FROM users WHERE id=\? AND status='active'\)/);
  assert.deepEqual(params,['customer-a','customer-a']);
 }
 assert.match(s.calls[1].sql,/customer_user_id=\?/);
 assert.match(s.calls[2].sql,/\$\.customerUserId/);
 assert.match(s.calls[3].sql,/WHERE user_id=\?/);
 assert.match(s.calls[4].sql,/WHERE user_id=\?/);
});
test('database outage denies access with 503 and no data',async()=>{
 const s=setup({dbError:true}),r=await s.GET();assert.equal(r.status,503);assert.equal(r.body.code,'CUSTOMER_ACTIVITY_UNAVAILABLE');
});
test('reservation backend outage preserves safe revision fallback',async()=>{
 const original=console.error;console.error=()=>{};
 try{const s=setup({reservationsError:true}),r=await s.GET();assert.equal(r.status,200);assert.equal(r.body.reservationsAvailable,false);assert.equal(s.calls.length,5);}
 finally{console.error=original;}
});
test('if account freezes after gate, each subsequent read remains active-status guarded',async()=>{
 const s=setup({freezeAfterGate:true}),r=await s.GET();
 assert.equal(r.status,200);assert.equal(r.body.unread,0);assert.equal(r.body.notificationId,null);
 assert.equal(s.calls.length,5);
 for(const {sql} of s.calls.slice(1))assert.match(sql,/status='active'/);
});
