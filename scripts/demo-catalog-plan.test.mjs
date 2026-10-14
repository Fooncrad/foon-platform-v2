import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const plan=JSON.parse(readFileSync(new URL('./demo-catalog-plan.json',import.meta.url),'utf8'));
const expected=['restaurant','cafe','sweets','grocery','clothing','perfume','accessories','gifts','ecommerce','carwash','laundry','automotive','salon','publicworks'];

test('14 distinct demo activities with safe slugs',()=>{
 assert.deepEqual(plan.activities.map(x=>x.code).sort(),expected.sort());
 assert.equal(new Set(plan.activities.map(x=>x.slug)).size,14);
 for(const activity of plan.activities){assert.match(activity.slug,/^foon-demo-[a-z]+$/);assert.ok(activity.displayName.includes('تجربة'));}
});

test('exactly 10 distinct categories and 10 matched items per activity',()=>{
 let categoryCount=0,itemCount=0;
 for(const activity of plan.activities){
  assert.equal(activity.categories.length,10,activity.code);
  assert.equal(new Set(activity.categories.map(x=>x.name)).size,10,activity.code);
  for(const category of activity.categories){
   categoryCount++;
   assert.equal(category.items.length,1,activity.code+':'+category.name);
   for(const item of category.items){
    itemCount++;
    assert.ok(item.name.includes(category.name),'Item name must match category');
    assert.ok(Number.isFinite(item.priceSAR)&&item.priceSAR>0);
    assert.equal(item.imageRequirement.subject,category.name);
    assert.equal(item.imageRequirement.aspectRatio,'1:1');
    assert.equal(item.imageRequirement.status,'PENDING_ASSET');
   }
  }
 }
 assert.equal(categoryCount,140);assert.equal(itemCount,140);
});

test('never treat an unseeded demo plan as production data',()=>{
 assert.equal(plan.purpose,'DEMO_ONLY_NOT_PRODUCTION_SEEDED');
 assert.ok(plan.warning.includes('licensed'));
});
