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
   const delivery=ok(await op('pos','POST',{...payload,requestKey:randomUUID(),channel:'delivery'}));assert.equal(delivery.total,115);const delivered=ok(await op('orders','GET'),200).orders.find(o=>o.id===delivery.id);assert.equal(delivered.checkout_snapshot.deliveryFee,10);assert.equal(delivered.checkout_snapshot.serviceFee,5);assert.equal(delivered.checkout_snapshot.tax,4.76);
   if(activity==='clothing'){
    ok(await op('orders','PATCH',{id:sale.id,version:latest.version,paymentStatus:'paid'}),200);
    if(process.env.FOON_BROWSER_EXECUTABLE){
     const browser=await chromium.launch({executablePath:process.env.FOON_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
     try{const context=await browser.newContext({viewport:{width:320,height:740}});const separator=owner.cookie.indexOf('=');await context.addCookies([{name:owner.cookie.slice(0,separator),value:owner.cookie.slice(separator+1),url:origin}]);await context.addInitScript(()=>{window.print=()=>{}});
      const page=await context.newPage();await page.goto(origin+'/restaurant?tenant='+owner.tenant+'&section=orders');
      const print=page.getByRole('button',{name:/طباعة.*إيصال دفع نهائي/});await print.waitFor({state:'visible',timeout:20000});const popupPromise=page.waitForEvent('popup');await print.click();const popup=await popupPromise;
      const qr=popup.getByAltText('Receipt QR');await qr.waitFor({state:'visible',timeout:15000});assert.ok((await qr.getAttribute('src')).startsWith('data:image/png;base64,'));
      const text=await popup.locator('body').innerText();assert.ok(text.includes('Saved seller'));assert.ok(text.includes('15.00'));assert.ok(!text.includes('Changed seller'));assert.equal(await popup.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
      console.log('Paid receipt and local QR browser check passed at 320px');
     }finally{await browser.close();}
    }
   }
   if(activity==='grocery'){
    const coupon=ok(await op('coupons','POST',{name:'Ten percent',status:'active',data:{code:'TEN',discountType:'percent',value:10}}));assert.ok(coupon.id);
    const discounted=ok(await op('pos','POST',{...payload,requestKey:randomUUID(),couponCode:'TEN'}));assert.equal(discounted.total,95);
    const discountedOrder=ok(await op('orders','GET'),200).orders.find(o=>o.id===discounted.id);assert.equal(discountedOrder.discount,10);assert.equal(discountedOrder.checkout_snapshot.tax,4.29);
    const customer=await call('/api/customer/register','POST',{name:'Tax customer',email:randomUUID()+'@test.example',password:'a-strong-test-password',storeSlug:slug});ok(customer);
    const purchase=ok(await call('/api/customer/orders','POST',{storeSlug:slug,branchId:registration.branch.id,channel:'takeaway',requestKey:randomUUID(),items:[{id:product,quantity:1}],total:0},{cookie:customer.cookie,tenant:owner.tenant}));assert.equal(purchase.total,105);
   }
  }
 }finally{await db.end();server.kill('SIGTERM');}
});
