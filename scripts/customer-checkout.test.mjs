import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVITY_PRESETS} from '../lib/platform/activity-presets.ts';
import {customerCheckout,customerCartAvailable,deliveryCountryMatches} from '../lib/platform/customer-checkout.ts';
test('each supported activity has an explicit customer journey',()=>{
 for(const activity of Object.keys(ACTIVITY_PRESETS))assert.ok(customerCheckout(activity),activity);
 for(const activity of ['restaurant','cafe','sweets','grocery','clothing','perfume','accessories','watches','gifts','ecommerce'])assert.equal(customerCheckout(activity),'cart');
 assert.equal(customerCheckout('laundry'),'service-cart');
 for(const activity of ['carwash','salon','automotive'])assert.equal(customerCheckout(activity),'appointment');
 assert.equal(customerCheckout('publicworks'),'quote');
});
test('cart policy preserves legacy restaurants and fails closed for unknown profiles',()=>{
 assert.equal(customerCartAvailable('','restaurant'),true);
 assert.equal(customerCartAvailable('','store'),false);
 assert.equal(customerCartAvailable('unknown','restaurant'),false);
 for(const activity of ['carwash','salon','automotive','publicworks','__proto__'])assert.equal(customerCartAvailable(activity),false);
 assert.equal(customerCartAvailable('laundry'),true);
});
test('delivery orders are restricted to the merchant country',()=>{
 assert.equal(deliveryCountryMatches('KW','SA'),false);
 assert.equal(deliveryCountryMatches('SA','SA'),true);
 assert.equal(deliveryCountryMatches(' sa ','SA'),true);
 assert.equal(deliveryCountryMatches('','SA'),false);
 assert.equal(deliveryCountryMatches('SA',null),false);
});
