import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runCustomerCartChecks({db,call,fixtures}){
 const serviceOnly=new Set(['carwash','automotive','salon','publicworks']);
 for(const fixture of fixtures){
  const {owner}=fixture,slug=owner.email.split('@')[0],activity=slug.replace('catalog-pos-','');
  const [[business]]=await db.execute('SELECT country_code FROM tenant_business_profiles WHERE tenant_id=?',[owner.tenant]);
  const customer=await call('/api/customer/register','POST',{name:'Cart customer',email:randomUUID()+'@test.example',password:'a-strong-test-password',storeSlug:slug});
  assert.equal(customer.status,201,JSON.stringify(customer.body));
  const category=await fixture.catalog('POST',{kind:'category',name:'Public cart category'});
  assert.equal(category.status,201);
  const saved=await fixture.catalog('POST',{kind:'product',name:'Public cart product',categoryId:category.body.id,price:7.25});assert.equal(saved.status,201);
  const product=saved.body.id;
  assert.equal((await fixture.catalog('PATCH',{kind:'product',id:product,stockQuantity:5})).status,200);
  const path='/api/customer/cart?store='+slug+'&product='+product;
  const context=await call(path,'GET');
  const payload={storeSlug:slug,branchId:owner.branch,currency:'USD',channel:'takeaway',requestKey:randomUUID(),items:[{id:product,quantity:2,price:0}],total:0};
  if(serviceOnly.has(activity)){
   assert.equal(context.status,403);assert.equal(context.body.code,'CART_NOT_AVAILABLE');
   const refused=await call('/api/customer/orders','POST',payload,customer.cookie);assert.equal(refused.status,403);assert.equal(refused.body.code,'CART_NOT_AVAILABLE');continue;
  }
  assert.equal(context.status,200,JSON.stringify(context.body));assert.equal(context.body.item.currency,'USD');assert.equal(context.body.item.price,7.25);assert.ok(context.body.item.branches.some(b=>b.id===owner.branch));
  const foreign=fixtures.find(f=>f.owner.tenant!==owner.tenant);
  assert.equal((await call('/api/customer/cart?store='+slug+'&product='+foreign.product,'GET')).status,404);
  const delivery={...payload,channel:'delivery',deliveryCountryCode:business.country_code,requestKey:randomUUID()};
  assert.equal((await call('/api/customer/orders','POST',delivery,customer.cookie)).body.code,'DELIVERY_DETAILS_REQUIRED');
  const foreignCountry=business.country_code==='SA'?'AE':'SA';
  const countryMismatch=await call('/api/customer/orders','POST',{...delivery,deliveryCountryCode:foreignCountry,deliveryAddress:'A valid test delivery address',customerPhone:'+966500000000',requestKey:randomUUID()},customer.cookie);
  assert.equal(countryMismatch.status,400);assert.equal(countryMismatch.body.code,'DELIVERY_COUNTRY_MISMATCH');
  const noDriver=await call('/api/customer/orders','POST',{...delivery,requestKey:randomUUID(),customerPhone:'+966500000000',deliveryAddress:'Test address, Riyadh'},customer.cookie);
  assert.equal(noDriver.status,409,JSON.stringify(noDriver.body));assert.equal(noDriver.body.code,'DELIVERY_DRIVER_UNAVAILABLE');
  const [[driverAlert]]=await db.execute("SELECT COUNT(*) AS n FROM platform_notification_outbox WHERE tenant_id=? AND event_key='delivery_driver_unavailable' AND recipient_email=?",[owner.tenant,owner.email]);assert.ok(Number(driverAlert.n)>=1,'the merchant is notified when delivery has no available driver');
  if(activity==='cafe'){const reads=await Promise.all(Array.from({length:20},()=>call(path,'GET')));assert.ok(reads.every(r=>r.status===200));}
  const attempts=await Promise.all(Array.from({length:12},()=>call('/api/customer/orders','POST',payload,customer.cookie)));
  const [created,replay]=attempts;assert.ok(attempts.every(r=>r.status===201&&r.body.id===created.body.id),JSON.stringify(attempts.map(r=>r.body)));
  assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(replay.status,201,JSON.stringify(replay.body));assert.equal(created.body.id,replay.body.id);assert.equal(created.body.total,14.5);assert.equal(created.body.currency,'USD');
  const [[stock]]=await db.execute('SELECT stock_quantity,product_type FROM catalog_products WHERE id=?',[product]);assert.equal(Number(stock.stock_quantity),activity==='laundry'?5:3);
  assert.equal((await fixture.catalog('PATCH',{kind:'product',id:product,enabled:false})).status,200);
  assert.equal((await call(path,'GET')).status,404);
 }
 console.info('Customer carts: eligible activities, service exclusions, public isolation, delivery details, authoritative prices, stock and idempotency verified');
}
