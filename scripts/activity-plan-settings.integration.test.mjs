import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
test('activity plan overrides isolate grants, limits and administrator permissions',async()=>{
 const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/foon_migration_test');
 const db=await mysql.createConnection(url.href),origin='http://127.0.0.1:3131';
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3131'],{env:{...process.env,APP_URL:origin},stdio:['ignore','pipe','pipe']});
 let serverOutput='';server.stdout.on('data',c=>serverOutput+=c);server.stderr.on('data',c=>serverOutput+=c);
 const call=async(path,method='GET',body,cookie='',tenant='')=>{const r=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json',cookie,...(tenant?{'x-foon-tenant':tenant}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const register=async(activity)=>{const slug='plan-'+randomUUID().slice(0,8);const r=await call('/api/auth/register','POST',{name:'Plan owner',email:slug+'@test.example',password:'synthetic-strong-password',storeName:slug,slug,activity,countryCode:'SA',currency:'SAR',region:'الرياض'});assert.equal(r.status,201,JSON.stringify(r.body));return {cookie:r.cookie,tenant:r.body.tenant.id,branch:r.body.branch.id,user:r.body.user.id};};
 try{
  let ready=false;for(let i=0;i<60;i++){try{await fetch(origin+'/login',{signal:AbortSignal.timeout(2000)});ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}assert.ok(ready,serverOutput);
  const admin=await register('restaurant'),grocery=await register('grocery'),clothing=await register('clothing'),automotive=await register('automotive');
  await db.execute("INSERT INTO platform_admins(user_id,role,enabled) VALUES (?,'admin',TRUE)",[admin.user]);
  const supportAccess=await call(`/api/admin/tenants/${admin.tenant}/access`,'POST',{},admin.cookie);assert.equal(supportAccess.status,200,JSON.stringify(supportAccess.body));
  const [[free]]=await db.query("SELECT id FROM package_plans WHERE code='free'");const endpoint='/api/admin/plans/'+free.id+'/features';
  assert.equal((await call(endpoint,'GET',undefined,grocery.cookie)).status,403);
  assert.equal((await call(endpoint,'PUT',{feature_key:'orders',activity:'grocery',enabled:false},grocery.cookie)).status,403);
  assert.equal((await call(endpoint+'?activity=unknown','GET',undefined,admin.cookie)).status,400);
  for(const activity of ['restaurant','cafe','sweets','grocery','clothing','perfume','accessories','watches','gifts','ecommerce','carwash','laundry','automotive','salon','publicworks']){
   const r=await call(endpoint+'?activity='+activity,'GET',undefined,admin.cookie);assert.equal(r.status,200,JSON.stringify(r.body));const menu=r.body.features.find(f=>f.feature_key==='digital_menu');assert.equal(Number(menu.enabled),1);assert.equal(menu.limit_value,20);assert.equal(Number(menu.overridden),1);
  }
  const save=(activity,feature_key,enabled,limit_value)=>call(endpoint,'PUT',{activity,feature_key,enabled,limit_value},admin.cookie);
  // The UI filter is not security: the API must refuse unsupported grants.
  const irrelevant=await save('automotive','digital_menu',true,null);
  assert.equal(irrelevant.status,422);assert.equal(irrelevant.body.code,'FEATURE_NOT_APPLICABLE');
  assert.equal((await save('restaurant','creator_profile',true,null)).status,422);
  // Existing legacy overrides may still be removed (reset) without re-granting them.
  assert.equal((await call(endpoint,'DELETE',{activity:'automotive',feature_key:'digital_menu'},admin.cookie)).status,200);
  assert.equal((await save('grocery','orders',false,null)).status,200);
  assert.equal((await call('/api/restaurant/operations/orders','GET',undefined,grocery.cookie,grocery.tenant)).status,403);
  const [[clothingMembership]]=await db.execute("SELECT role,status FROM memberships WHERE tenant_id=? AND user_id=? LIMIT 1",[clothing.tenant,clothing.user]);
  const [[clothingSession]]=await db.execute("SELECT id,user_id FROM auth_sessions WHERE token_hash=? LIMIT 1",[createHash('sha256').update(clothing.cookie.slice(clothing.cookie.indexOf('=')+1)).digest('hex')]);
  const clothingOrders=await call('/api/restaurant/operations/orders','GET',undefined,clothing.cookie,clothing.tenant);assert.equal(clothingOrders.status,200,JSON.stringify({response:clothingOrders.body,membership:clothingMembership,session:clothingSession,tenant:clothing.tenant,user:clothing.user}));
  assert.equal((await save('grocery','digital_menu',true,2)).status,200);
  // Bootstrap is one-time initialization, not a reset of existing custom
  // settings. A deliberately removed override must continue to inherit.
  await db.execute("DELETE FROM package_plan_activity_features WHERE plan_id=? AND activity_code='automotive' AND feature_key='catalog'",[free.id]);
  for(let i=0;i<2;i++){
   const seeded=await call('/api/admin/plans/bootstrap','POST',{confirm:'CREATE_FOUR_PLANS'},admin.cookie);
   assert.equal(seeded.status,200,JSON.stringify(seeded.body));
   assert.equal(seeded.body.freeActivitiesSeeded,0);
  }
  const [[restored]]=await db.execute("SELECT COUNT(*) AS n FROM package_plan_activity_features WHERE plan_id=? AND activity_code='automotive' AND feature_key='catalog'",[free.id]);
  assert.equal(Number(restored.n),0);
  const [[custom]]=await db.execute("SELECT enabled,limit_value FROM package_plan_activity_features WHERE plan_id=? AND activity_code='grocery' AND feature_key='digital_menu'",[free.id]);
  assert.equal(Number(custom.enabled),1);assert.equal(Number(custom.limit_value),2);
  // Real HTTP + DB regression: the Business plan must persist grants and
  // allow a service quotation creation, not just display a feature name.
  const [[business]]=await db.execute("SELECT id FROM package_plans WHERE code='enterprise' LIMIT 1");
  assert.ok(business?.id,"Business plan is seeded");
  const businessPage=await call('/api/admin/plans/'+business.id+'/features?activity=automotive','GET',undefined,admin.cookie);
  assert.equal(businessPage.status,200,JSON.stringify(businessPage.body));
  for(const key of ['quotes','pos','employees','customer_invoices','delivery','payments']){
   const feature=businessPage.body.features.find(f=>f.feature_key===key);
   assert.equal(Number(feature?.enabled),1,'Business should explicitly grant '+key);
  }
  const [[persisted]]=await db.execute("SELECT COUNT(*) AS n FROM package_plan_features WHERE plan_id=? AND enabled=TRUE AND feature_key IN ('quotes','pos','employees','customer_invoices','delivery','payments')",[business.id]);
  assert.equal(Number(persisted.n),6,"grants must be stored, not virtual enterprise fallback");
  await db.execute("UPDATE tenant_subscriptions SET plan_id=?,starts_at=NULL,ends_at=NULL WHERE tenant_id IN (?,?)",[business.id,automotive.tenant,grocery.tenant]);
  const quotePath='/api/restaurant/operations/quotations';
  const quoteWrite={name:'Actual Business quotation',branchId:automotive.branch,status:'draft',data:{customerName:'Integration customer',serviceDescription:'Repair inspection',amount:100}};
  const created=await call(quotePath,'POST',quoteWrite,automotive.cookie,automotive.tenant);
  assert.equal(created.status,201,JSON.stringify(created.body));
  const quoteRead=await call(quotePath,'GET',undefined,automotive.cookie,automotive.tenant);
  assert.equal(quoteRead.status,200,JSON.stringify(quoteRead.body));
  assert.ok(quoteRead.body.resources.some(row=>row.id===created.body.id),"created resource must be persisted and readable");
  assert.equal((await call('/api/restaurant/operations/pos','GET',undefined,grocery.cookie,grocery.tenant)).status,200);
  await db.execute("UPDATE package_plan_features SET enabled=FALSE WHERE plan_id=? AND feature_key='quotes'",[business.id]);
  assert.equal((await call(quotePath,'GET',undefined,automotive.cookie,automotive.tenant)).body.code,'PLAN_FEATURE_REQUIRED');
  assert.equal((await call(quotePath,'POST',quoteWrite,automotive.cookie,automotive.tenant)).body.code,'PLAN_FEATURE_REQUIRED');
  await db.execute("DELETE FROM package_plan_features WHERE plan_id=? AND feature_key='quotes'",[business.id]);
  assert.equal((await call(quotePath,'GET',undefined,automotive.cookie,automotive.tenant)).body.code,'PLAN_FEATURE_REQUIRED','missing Business grant must fail closed');
  await db.execute("INSERT INTO package_plan_features(plan_id,feature_key,enabled,limit_value) VALUES (?,'quotes',TRUE,NULL)",[business.id]);
  assert.equal((await call(quotePath,'GET',undefined,automotive.cookie,automotive.tenant)).status,200);
  await db.execute("UPDATE tenant_subscriptions SET plan_id=? WHERE tenant_id IN (?,?)",[free.id,automotive.tenant,grocery.tenant]);
  const catalog='/api/restaurant/activity-catalog';const category=await call(catalog,'POST',{kind:'category',name:'Category'},grocery.cookie,grocery.tenant);assert.equal(category.status,201,JSON.stringify(category.body));
  const product={kind:'product',name:'First product',price:5,categoryId:category.body.id};
  assert.equal((await call(catalog,'POST',product,grocery.cookie,grocery.tenant)).status,201);
  const race=await Promise.all(['Second','Third'].map(name=>call(catalog,'POST',{...product,name},grocery.cookie,grocery.tenant)));assert.deepEqual(race.map(r=>r.status).sort(),[201,403]);assert.equal(race.find(r=>r.status===403).body.code,'PLAN_LIMIT_REACHED');
  const rejectedImport=await call('/api/restaurant/catalog-import','POST',{kind:'items',requestKey:randomUUID(),rows:[{category:'Category',name:'Cannot bypass by import',price:'5'}]},grocery.cookie,grocery.tenant);assert.equal(rejectedImport.body.code,'PLAN_LIMIT_REACHED');
  const [[productsAfterImport]]=await db.execute('SELECT COUNT(*) AS n FROM catalog_products WHERE tenant_id=?',[grocery.tenant]);assert.equal(Number(productsAfterImport.n),2);
  assert.equal((await save('restaurant','digital_menu',true,1)).status,200);
  const legacyCategory=await call('/api/restaurant/menu/categories','POST',{name:'Legacy category'},admin.cookie,admin.tenant);assert.equal(legacyCategory.status,201,JSON.stringify({body:legacyCategory.body,serverOutput}));
  assert.equal((await call('/api/restaurant/menu/categories','POST',{name:'Denied category'},admin.cookie,admin.tenant)).body.code,'PLAN_LIMIT_REACHED');
  const legacyProduct={name:'Legacy item',price:'5',categoryId:legacyCategory.body.category.id};assert.equal((await call('/api/restaurant/menu/items','POST',legacyProduct,admin.cookie,admin.tenant)).status,201);
  assert.equal((await call('/api/restaurant/menu/items','POST',{...legacyProduct,name:'Denied item'},admin.cookie,admin.tenant)).body.code,'PLAN_LIMIT_REACHED');
  assert.equal((await call('/api/restaurant/operations/categories','POST',{name:'Cannot bypass canonical route',status:'active',data:{}},admin.cookie,admin.tenant)).body.code,'PLAN_LIMIT_REACHED');
  assert.equal((await call(endpoint,'DELETE',{activity:'restaurant',feature_key:'digital_menu'},admin.cookie)).status,200);
  assert.equal((await save('grocery','digital_menu',true,0)).status,200);assert.equal((await call(catalog,'POST',{kind:'category',name:'Zero denied'},grocery.cookie,grocery.tenant)).body.code,'PLAN_LIMIT_REACHED');
  assert.equal((await save('grocery','digital_menu',true,null)).status,200);assert.equal((await call(catalog,'POST',{...product,name:'Unlimited'},grocery.cookie,grocery.tenant)).status,201);
  assert.equal((await call(endpoint,'DELETE',{activity:'grocery',feature_key:'digital_menu'},admin.cookie)).status,200);
  const reset=await call(endpoint+'?activity=grocery','GET',undefined,admin.cookie);assert.equal(Number(reset.body.features.find(f=>f.feature_key==='digital_menu').overridden),0);
  const [[base]]=await db.execute("SELECT enabled,limit_value FROM package_plan_features WHERE plan_id=? AND feature_key='orders'",[free.id]);assert.equal(Number(base.enabled),1);
  const [[other]]=await db.execute("SELECT limit_value FROM package_plan_activity_features WHERE plan_id=? AND activity_code='clothing' AND feature_key='digital_menu'",[free.id]);assert.equal(other.limit_value,20);
  assert.equal((await call(endpoint,'DELETE',{activity:'grocery',feature_key:'orders'},admin.cookie)).status,200);
  // Plan pricing is audited and the Free tier remains zero-cost across currencies.
  const prices='/api/admin/plans/'+free.id+'/prices';
  const zero=await call(prices,'PUT',{billing_cycle:'monthly',currency:'SAR',price:0,enabled:true},admin.cookie);
  assert.equal(zero.status,200,JSON.stringify(zero.body));
  const invalidFree=await call(prices,'PUT',{billing_cycle:'monthly',currency:'SAR',price:1,enabled:true},admin.cookie);
  assert.equal(invalidFree.status,409);assert.equal(invalidFree.body.code,'FREE_PLAN_MUST_BE_ZERO');
  const [[freePrice]]=await db.execute("SELECT price FROM package_plan_prices WHERE plan_id=? AND billing_cycle='monthly' AND currency='SAR'",[free.id]);
  assert.equal(Number(freePrice.price),0);
  const [[paidPlan]]=await db.execute("SELECT id FROM package_plans WHERE code='starter'");
  const paid=await call('/api/admin/plans/'+paidPlan.id+'/prices','PUT',{billing_cycle:'yearly',currency:'SAR',price:129.99,enabled:true},admin.cookie);
  assert.equal(paid.status,200,JSON.stringify(paid.body));
  const [[priceAudits]]=await db.execute("SELECT COUNT(*) AS n FROM platform_audit_events WHERE actor_user_id=? AND action='plan.price.update'",[admin.user]);
  assert.ok(Number(priceAudits.n)>=2);
  await db.execute("UPDATE platform_admins SET role='support' WHERE user_id=?",[admin.user]);
  assert.equal((await call(endpoint+'?activity=grocery','GET',undefined,admin.cookie)).status,200);assert.equal((await save('grocery','orders',true,null)).status,403);assert.equal((await call(endpoint,'DELETE',{activity:'grocery',feature_key:'orders'},admin.cookie)).status,403);
  const [[audit]]=await db.execute("SELECT COUNT(*) AS n FROM platform_audit_events WHERE actor_user_id=? AND action IN ('plan.feature.update','plan.activity_feature.reset')",[admin.user]);assert.ok(Number(audit.n)>=5);
  console.log('All 15 free catalogs, independent activity grants, zero/unlimited/reset semantics, concurrent limits, admin/support/owner authorization and audit verified');
 }finally{server.kill();await db.end();}
});
