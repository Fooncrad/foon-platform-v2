import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import mysql from 'mysql2/promise';
test('employees stay in their employer workspace and platform admins never inherit ownership',async()=>{
 const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/foon_migration_test');
 const db=await mysql.createConnection(url.href),origin='http://127.0.0.1:3132';
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3132'],{env:{...process.env,APP_URL:origin},stdio:['ignore','pipe','pipe']});
 let serverOutput='';server.stdout.on('data',c=>serverOutput+=c);server.stderr.on('data',c=>serverOutput+=c);
 const request=(path,method='GET',body,cookie='',tenant='')=>fetch(origin+path,{method,redirect:'manual',headers:{origin,'content-type':'application/json',cookie,...(tenant?{'x-foon-tenant':tenant}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const password='synthetic-strong-password';
 const register=async()=>{const slug='surface-'+randomUUID().slice(0,8);const r=await request('/api/auth/register','POST',{name:'Owner',email:slug+'@test.example',password,storeName:slug,slug,activity:'grocery',countryCode:'SA',currency:'SAR',region:'الرياض'});assert.equal(r.status,201);return {...await r.json(),slug,cookie:r.headers.get('set-cookie').split(';')[0]};};
 try{
  let ready=false;for(let i=0;i<60;i++){try{await fetch(origin+'/login',{signal:AbortSignal.timeout(2000)});ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}assert.ok(ready,serverOutput);
  const owner=await register(),other=await register(),admin=await register();
  await db.execute("INSERT INTO platform_admins(user_id,role,enabled) VALUES (?,'super_admin',TRUE)",[admin.user.id]);
  assert.equal((await request('/api/restaurant/operations/orders','GET',undefined,admin.cookie,owner.tenant.id)).status,403);
  const supportAccess=await request('/api/admin/tenants/'+owner.tenant.id+'/access','POST',{},admin.cookie);assert.equal(supportAccess.status,200,await supportAccess.clone().text());
  const adminWorkspace=await request('/restaurant?tenant='+owner.tenant.id,'GET',undefined,admin.cookie);
  const token=admin.cookie.slice(admin.cookie.indexOf('=')+1),tokenHash=createHash('sha256').update(token).digest('hex');
  const [[session]]=await db.execute('SELECT id,last_seen_at FROM auth_sessions WHERE token_hash=?',[tokenHash]);
  const [supportRows]=await db.execute('SELECT s.auth_session_id,s.actor_user_id,s.tenant_id,s.platform_role,s.ended_at,s.expires_at,s.expires_at>UTC_TIMESTAMP() AS unexpired,pa.enabled AS admin_enabled,u.status AS user_status,t.status AS tenant_status,UTC_TIMESTAMP() AS db_now FROM platform_tenant_support_sessions s LEFT JOIN platform_admins pa ON pa.user_id=s.actor_user_id LEFT JOIN users u ON u.id=s.actor_user_id LEFT JOIN tenants t ON t.id=s.tenant_id WHERE s.auth_session_id=?',[session?.id??'']);
  // The old /restaurant route must NOT silently render a grocery tenant.
  // Follow its canonical activity redirect and validate the scoped support session.
  assert.equal(adminWorkspace.status,307,'admin workspace redirect: '+JSON.stringify({location:adminWorkspace.headers.get('location'),session,supportRows,adminId:admin.user.id,tenantId:owner.tenant.id,serverOutput}));
  const adminCanonical=adminWorkspace.headers.get('location')||'';
  assert.match(adminCanonical,/^\/grocery\?tenant=/);
  const adminResolved=await request(adminCanonical,'GET',undefined,admin.cookie);
  assert.equal(adminResolved.status,200,'administrator must access only the authorized grocery activity');
  assert.notEqual((await request('/api/restaurant/operations/orders','POST',{},admin.cookie,owner.tenant.id)).status,403,'platform administrators must have full tenant support access');
  const [[supportAudit]]=await db.execute("SELECT COUNT(*) AS n FROM platform_audit_events WHERE actor_user_id=? AND target_id=? AND action='admin.tenant.support.start'",[admin.user.id,owner.tenant.id]);assert.equal(Number(supportAudit.n),1);
  assert.equal((await request('/api/admin/tenants/access','DELETE',undefined,admin.cookie)).status,200);
  assert.equal((await request('/restaurant?tenant='+owner.tenant.id,'GET',undefined,admin.cookie)).status,307);
  assert.equal((await request('/api/admin/tenants','GET',undefined,owner.cookie)).status,403);
  const [[branch]]=await db.execute('SELECT id FROM branches WHERE tenant_id=? LIMIT 1',[owner.tenant.id]);
  for(const role of ['manager','cashier','waiter','kitchen','driver','accountant']){
   const staff=randomUUID(),email=staff+'@test.example';
   await db.execute("INSERT INTO users(id,email,password_hash,display_name,status) SELECT ?,?,password_hash,'Employee','active' FROM users WHERE id=?",[staff,email,owner.user.id]);
   await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,?,'active')",[randomUUID(),owner.tenant.id,staff,role]);
   await db.execute('INSERT INTO employee_branch_assignments(id,tenant_id,user_id,branch_id,role) VALUES (?,?,?,?,?)',[randomUUID(),owner.tenant.id,staff,branch.id,role]);
   await db.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,'orders.view',TRUE)",[randomUUID(),owner.tenant.id,staff,branch.id]);
   const login=await request('/api/auth/login','POST',{email,password});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
   assert.equal((await request('/api/restaurant/operations/orders','GET',undefined,cookie,owner.tenant.id)).status,200,role+' own work');
   const legacyWorkspace=await request('/restaurant?tenant='+owner.tenant.id,'GET',undefined,cookie);
   assert.equal(legacyWorkspace.status,307,'legacy activity route must redirect to stored activity');
   const employeePath=legacyWorkspace.headers.get('location')||'';
   assert.match(employeePath,/^\/grocery\?tenant=/);
   const workspace=await request(employeePath,'GET',undefined,cookie);
   assert.equal(workspace.status,200,role+' own authorized workspace');
   assert.doesNotMatch(await workspace.text(),/href="\/account\/library"/);
   assert.equal((await request('/api/restaurant/operations/orders','GET',undefined,cookie,other.tenant.id)).status,403,role+' other employer');
   for(const [path,method] of [['/api/customer/orders','POST'],['/api/customer/services','POST'],['/api/customer/payments','POST'],['/api/customer/join-store','POST'],['/api/customer/stores','POST'],['/api/customer/register','POST'],['/api/customer/order-revision','GET'],['/api/customer/notifications','POST'],['/api/customer/invoices','GET'],['/api/customer/cart','GET'],['/api/account/library','GET'],['/api/account/library','POST'],['/api/account/library','DELETE'],['/api/account/library/'+randomUUID(),'GET'],['/api/restaurant/onboard','POST']]){
    const r=await request(path,method,method==='GET'?undefined:{},cookie);assert.equal(r.status,403,role+' '+path);assert.equal((await r.json()).code,'EMPLOYEE_OPERATIONAL_ACCESS_ONLY');
   }
   for(const path of ['/customer','/account/library','/restaurant/register','/'+owner.slug,'/'+owner.slug+'/order','/'+owner.slug+'/register','/'+owner.slug+'/login']){
    const denied=await request(path,'GET',undefined,cookie);
    assert.ok([307,308].includes(denied.status),role+' '+path+' '+denied.status);
    // Restricted personal surfaces may redirect through /account or legacy
    // /restaurant, but must end in the staff member's authorized activity.
    let target=denied.headers.get('location')||'';
    for(let hop=0;hop<4&&new URL(target,origin).pathname!=='/grocery';hop++){
     assert.ok(target.startsWith('/'),role+' unsafe redirect '+target);
     const next=await request(target,'GET',undefined,cookie);
     assert.ok([307,308].includes(next.status),role+' must never render '+target);
     target=next.headers.get('location')||'';
    }
    assert.equal(new URL(target,origin).pathname,'/grocery',role+' must return to employer activity, not a personal storefront');
   }
   if(role==='manager'){const copied=await request('/api/restaurant/assets','POST',{libraryId:randomUUID()},cookie,owner.tenant.id);assert.equal(copied.status,403);assert.equal((await copied.json()).code,'EMPLOYEE_OPERATIONAL_ACCESS_ONLY');}
   // Even a historical customer link cannot restore shopping privileges.
   await db.execute('INSERT INTO tenant_customers(tenant_id,user_id) VALUES (?,?)',[owner.tenant.id,staff]);
   assert.equal((await request('/api/customer/orders','POST',{},cookie)).status,403);
   await db.execute("UPDATE memberships SET status='suspended' WHERE user_id=?",[staff]);
   assert.equal((await request('/api/account/library','GET',undefined,cookie)).status,403);
   assert.equal((await request('/api/restaurant/operations/orders','GET',undefined,cookie,owner.tenant.id)).status,403);
  }
  assert.equal((await request('/api/account/library','GET',undefined,owner.cookie)).status,200);
  const customerSlug='customer-'+randomUUID().slice(0,8);const customer=await request('/api/customer/register','POST',{name:'Customer',email:customerSlug+'@test.example',password,storeSlug:owner.slug});assert.equal(customer.status,201);const customerCookie=customer.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/customer/order-revision','GET',undefined,customerCookie)).status,200);
  assert.equal((await request('/api/restaurant/operations/orders','GET',undefined,customerCookie,owner.tenant.id)).status,403);
  console.log('Six employee roles: personal shopping/library/pages denied, own permitted work retained, other tenants/admin denied, suspended staff denied, owners/customers preserved');
 }finally{server.kill();await db.end();}
});
