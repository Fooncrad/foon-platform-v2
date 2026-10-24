import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import mysql from 'mysql2/promise';
import {chromium} from '@playwright/test';
test('authoritative tax and fees persist across activities, replay and settings changes',async()=>{
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/foon_migration_test');
 const origin='http://127.0.0.1:3117',server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3117'],{env:{...process.env,APP_URL:origin},stdio:'ignore'});
 const db=await mysql.createConnection(url.href);
 const call=async(path,method='GET',body,owner)=>{const r=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json',...(owner?{cookie:owner.cookie,'x-foon-tenant':owner.tenant}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const ok=(r,status=201)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
 try{
  let ready=false;for(let i=0;i<100;i++){try{await fetch(origin+'/login');ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}assert.ok(ready);
  const plan=randomUUID();await db.execute('INSERT INTO package_plans(id,code,name_ar,name_en,name_fr) VALUES (?,?,?,?,?)',[plan,'tax-'+plan,'اختبار','Test','Test']);
  for(const key of ['branding.colors','digital_menu','pos','orders','coupons']){await db.execute("INSERT IGNORE INTO package_features(feature_key,name_ar,name_en,category) VALUES (?,?,?,'test')",[key,key,key]);await db.execute('INSERT INTO package_plan_features(plan_id,feature_key,enabled) VALUES (?,?,TRUE)',[plan,key]);}
  for(const activity of ['restaurant','cafe','sweets','grocery','clothing','perfume','accessories','watches','gifts','ecommerce','carwash','laundry','automotive','salon','publicworks']){
   const slug='tax-'+randomUUID().slice(0,12),account=await call('/api/auth/register','POST',{name:slug,storeName:slug,slug,email:slug+'@test.example',password:'a-strong-test-password',kind:'restaurant',activity,countryCode:'SA',currency:'SAR',region:'الرياض'});const registration=ok(account),owner={cookie:account.cookie,tenant:registration.tenant.id};
   await db.execute('UPDATE tenant_subscriptions SET plan_id=? WHERE tenant_id=?',[plan,owner.tenant]);
   const op=(module,method,body)=>call('/api/restaurant/operations/'+module,method,body,owner);
   const settings=ok(await op('storefront','POST',{name:'Identity',status:'active',data:{legalName:'Saved seller',taxNumber:'300000000000003',vatEnabled:'yes',vatRate:15,menuStoredPricesIncludeVat:'no'}}));
   let product;
   if(activity==='restaurant'){
    const category=ok(await op('categories','POST',{name:'Tax category',status:'active',data:{}}));product=ok(await op('menu','POST',{name:'Tax item',status:'active',branchId:registration.branch.id,data:{categoryId:category.id,price:100}})).id;
   }else{
    const category=ok(await call('/api/restaurant/activity-catalog','POST',{kind:'category',name:'Tax category'},owner));product=ok(await call('/api/restaurant/activity-catalog','POST',{kind:'product',categoryId:category.id,name:'Tax product',price:100},owner)).id;
   }
   const payload={requestKey:randomUUID(),branchId:registration.branch.id,channel:'takeaway',items:[{id:product,quantity:1}],total:0,tax:0,checkout_snapshot:{tax:0}};
   const sale=ok(await op('pos','POST',payload));assert.equal(sale.total,115,activity);
   const orders=ok(await op('orders','GET'),200),order=orders.orders.find(o=>o.id===sale.id);assert.equal(order.checkout_snapshot.tax,15);assert.equal(order.checkout_snapshot.net,100);assert.equal(order.checkout_snapshot.seller.name,'Saved seller');
   const [[resource]]=await db.execute('SELECT version FROM restaurant_resources WHERE id=?',[settings.id]);
   ok(await op('storefront','PATCH',{id:settings.id,version:Number(resource.version),name:'Changed identity',status:'active',data:{legalName:'Changed seller',vatEnabled:'yes',vatRate:5,menuStoredPricesIncludeVat:'yes',checkoutServiceFee:5,checkoutDeliveryFee:10}}),200);
   const replay=ok(await op('pos','POST',payload));assert.equal(replay.id,sale.id);assert.equal(replay.total,115);
   const latest=ok(await op('orders','GET'),200).orders.find(o=>o.id===sale.id);assert.equal(latest.checkout_snapshot.tax,15);assert.equal(latest.checkout_snapshot.seller.name,'Saved seller');
   const driverUser=randomUUID(),driverResource=randomUUID();await db.execute("INSERT INTO users(id,email,display_name,status) VALUES (?,?,?,'active')",[driverUser,slug+'-driver@test.example','Test driver']);await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,'driver','active')",[randomUUID(),owner.tenant,driverUser]);await db.execute("INSERT INTO employee_branch_assignments(id,tenant_id,user_id,branch_id,role,enabled) VALUES (?,?,?,?,'driver',TRUE)",[randomUUID(),owner.tenant,driverUser,registration.branch.id]);await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data) VALUES (?,?,?,'employee','Test driver','active',?)",[driverResource,owner.tenant,registration.branch.id,JSON.stringify({role:'driver',userId:driverUser})]);
   const delivery=ok(await op('pos','POST',{...payload,requestKey:randomUUID(),channel:'delivery'}));assert.equal(delivery.total,115);const delivered=ok(await op('orders','GET'),200).orders.find(o=>o.id===delivery.id);assert.equal(delivered.checkout_snapshot.deliveryFee,10);assert.equal(delivered.checkout_snapshot.serviceFee,5);assert.equal(delivered.checkout_snapshot.tax,4.76);assert.equal(delivered.checkout_snapshot.assignedDriverId,driverResource);
   if(activity==='clothing'){
    ok(await op('orders','PATCH',{id:sale.id,version:latest.version,paymentStatus:'paid'}),200);
    const shared=ok(await call('/api/restaurant/receipts','POST',{id:sale.id},owner),200);assert.match(shared.path,new RegExp('^/receipts/'+sale.id+'\\?key=[a-f0-9]{64}$'));
    assert.equal(ok(await call('/api/restaurant/receipts','POST',{id:sale.id},owner),200).path,shared.path);
    const guestPage=await fetch(origin+shared.path);assert.equal(guestPage.status,200);assert.ok((await guestPage.text()).includes('Saved seller'));
    assert.equal((await fetch(origin+shared.path.slice(0,shared.path.indexOf('?'))+'?key='+'0'.repeat(64))).status,404);
    const ownReceipt=await fetch(origin+'/receipts/'+sale.id,{headers:{cookie:owner.cookie}});assert.equal(ownReceipt.status,200);assert.ok((await ownReceipt.text()).includes('Saved seller'));
    const anonymous=await fetch(origin+'/receipts/'+sale.id,{redirect:'manual'});assert.equal(anonymous.status,307);assert.ok(anonymous.headers.get('location').includes('/login?next='));
    const strangerName='other-'+randomUUID().slice(0,10),stranger=await call('/api/auth/register','POST',{name:strangerName,storeName:strangerName,slug:strangerName,email:strangerName+'@test.example',password:'a-strong-test-password',kind:'restaurant',activity:'clothing',countryCode:'SA',currency:'SAR',region:'الرياض'});ok(stranger);assert.equal((await fetch(origin+'/receipts/'+sale.id,{headers:{cookie:stranger.cookie}})).status,404);assert.equal((await call('/api/restaurant/receipts','POST',{id:sale.id},{cookie:stranger.cookie,tenant:owner.tenant})).status,404);
    const setDestination=async destination=>{const [[current]]=await db.execute('SELECT version,data FROM restaurant_resources WHERE id=?',[settings.id]);const data=typeof current.data==='string'?JSON.parse(current.data):current.data;ok(await op('storefront','PATCH',{id:settings.id,version:Number(current.version),name:'Changed identity',status:'active',data:{...data,receiptQrDestination:destination}}),200);};
    await setDestination('storefront');const storeLink=ok(await call('/api/restaurant/receipts','POST',{id:sale.id},owner),200);assert.ok(storeLink.path.startsWith('/'+slug+'#receipt='+sale.id+'&key='));
    assert.equal((await fetch(origin+shared.path+'&store=wrong-store')).status,404);
    await setDestination('pos');const posLink=ok(await call('/api/restaurant/receipts','POST',{id:sale.id},owner),200);assert.equal(posLink.path,'/receipts/'+sale.id+'?view=pos');
    const posAnonymous=await fetch(origin+posLink.path,{redirect:'manual'});assert.equal(posAnonymous.status,307);assert.ok(posAnonymous.headers.get('location').includes('/login?next='));
    const posOwner=await fetch(origin+posLink.path,{headers:{cookie:owner.cookie},redirect:'manual'});assert.equal(posOwner.status,307);assert.ok(posOwner.headers.get('location').includes('section=pos'));assert.equal((await fetch(origin+posLink.path,{headers:{cookie:stranger.cookie}})).status,404);
    await setDestination('receipt');
    if(process.env.FOON_BROWSER_EXECUTABLE){
     const browser=await chromium.launch({executablePath:process.env.FOON_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
     try{const context=await browser.newContext({viewport:{width:320,height:740}});const separator=owner.cookie.indexOf('=');await context.addCookies([{name:owner.cookie.slice(0,separator),value:owner.cookie.slice(separator+1),url:origin}]);await context.addInitScript(()=>{window.print=()=>{}});
      const page=await context.newPage();await page.goto(origin+'/restaurant?tenant='+owner.tenant+'&section=orders');
      const print=page.getByRole('button',{name:/طباعة.*إيصال دفع نهائي/});await print.waitFor({state:'visible',timeout:20000});const popupPromise=page.waitForEvent('popup');await print.click();const popup=await popupPromise;
      const qr=popup.getByAltText('Receipt QR');await qr.waitFor({state:'visible',timeout:15000});assert.ok((await qr.getAttribute('src')).startsWith('data:image/png;base64,'));
      const text=await popup.locator('body').innerText();assert.ok(text.includes('Saved seller'));assert.ok(text.includes('15.00'));assert.ok(!text.includes('Changed seller'));
      const receiptLink=popup.getByRole('link',{name:'عرض الإيصال',exact:true});assert.equal(await receiptLink.getAttribute('href'),origin+shared.path);
      const receipt=await page.request.get(origin+'/receipts/'+sale.id);assert.equal(receipt.status(),200);assert.ok((await receipt.text()).includes('Saved seller'));
      assert.equal(await popup.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
      const visitorContext=await browser.newContext({viewport:{width:320,height:740}}),visitor=await visitorContext.newPage();
      await visitor.goto(origin+storeLink.path);const modal=visitor.getByRole('dialog');await modal.waitFor({state:'visible'});const frame=visitor.frameLocator('iframe');await frame.getByRole('heading',{name:/إيصال الدفع/}).waitFor();assert.ok((await frame.locator('body').innerText()).includes('Saved seller'));assert.equal(await visitor.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);await visitor.getByRole('button',{name:/إغلاق الإيصال وتصفح المتجر/}).click();assert.equal(await modal.isVisible(),false);assert.equal(new URL(visitor.url()).pathname,'/'+slug);assert.equal(new URL(visitor.url()).hash,'');
      await visitor.goto(origin+shared.path);assert.ok((await visitor.locator('body').innerText()).includes('Saved seller'));await visitor.goto(origin+'/receipts/'+sale.id);assert.ok(visitor.url().includes('/login?next='));await visitor.locator('input[name="email"]').fill(slug+'@test.example');await visitor.locator('input[name="password"]').fill('a-strong-test-password');await visitor.getByRole('button',{name:'تسجيل الدخول',exact:true}).click();await visitor.waitForURL(origin+'/receipts/'+sale.id);assert.ok((await visitor.locator('body').innerText()).includes('Saved seller'));assert.equal(await visitor.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);await visitorContext.close();
      console.log('Paid receipt, local QR link and login return browser checks passed at 320px');
     }finally{await browser.close();}
    }
   }
   if(activity==='grocery'){
    const coupon=ok(await op('coupons','POST',{name:'Ten percent',status:'active',data:{code:'TEN',discountType:'percent',value:10}}));assert.ok(coupon.id);
    const discounted=ok(await op('pos','POST',{...payload,requestKey:randomUUID(),couponCode:'TEN'}));assert.equal(discounted.total,95);
    const discountedOrder=ok(await op('orders','GET'),200).orders.find(o=>o.id===discounted.id);assert.equal(discountedOrder.discount,10);assert.equal(discountedOrder.checkout_snapshot.tax,4.29);
    const customer=await call('/api/customer/register','POST',{name:'Tax customer',email:randomUUID()+'@test.example',password:'a-strong-test-password',storeSlug:slug});ok(customer);
    await db.execute('UPDATE users SET email_verified_at=UTC_TIMESTAMP() WHERE id=?',[customer.body.user.id]);
    const purchase=ok(await call('/api/customer/orders','POST',{storeSlug:slug,branchId:registration.branch.id,channel:'takeaway',requestKey:randomUUID(),items:[{id:product,quantity:1}],total:0},{cookie:customer.cookie,tenant:owner.tenant}));assert.equal(purchase.total,105);
    const customerOrder=ok(await op('orders','GET'),200).orders.find(o=>o.id===purchase.id);ok(await op('orders','PATCH',{id:purchase.id,version:customerOrder.version,paymentStatus:'paid'}),200);
    assert.equal((await fetch(origin+'/receipts/'+purchase.id,{headers:{cookie:customer.cookie}})).status,200);assert.equal(ok(await call('/api/restaurant/receipts','POST',{id:purchase.id},owner),200).path,'/receipts/'+purchase.id);
   }
  }
 }finally{await db.end();server.kill('SIGTERM');}
});
