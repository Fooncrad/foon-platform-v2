import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Extract and execute the actual checkout expression. This is not a copied
// approximation: regressions in public-menu.tsx break the test itself.
const page=readFileSync(new URL('../app/[slug]/public-menu.tsx',import.meta.url),'utf8');
const matches=[...page.matchAll(/\.\.\.(\(savedDelivery\?\.latitude!=null&&savedDelivery\?\.longitude!=null[\s\S]*?\?\{latitude:savedDelivery\.latitude,longitude:savedDelivery\.longitude\}:\{\}\))/g)];
assert.equal(matches.length,1,'expected exactly one restaurant checkout GPS expression');
const coordinates=new Function('savedDelivery','f',`return ${matches[0][1]};`);
const saved={street:'123 Example St',city:'Riyadh',countryCode:'SA',latitude:24.7,longitude:46.7};
function input(changes={}){
 const data=new FormData();
 for(const [key,value] of Object.entries({deliveryAddress:saved.street,deliveryCity:saved.city,deliveryCountryCode:saved.countryCode,...changes}))data.set(key,value);
 return data;
}
test('saved GPS reused only for a matching address',()=>assert.deepEqual(coordinates(saved,input()),{latitude:24.7,longitude:46.7}));
test('changed street must drop stale GPS',()=>assert.deepEqual(coordinates(saved,input({deliveryAddress:'999 New St'})),{}));
test('changed city must drop stale GPS',()=>assert.deepEqual(coordinates(saved,input({deliveryCity:'Jeddah'})),{}));
test('changed country must drop stale GPS',()=>assert.deepEqual(coordinates(saved,input({deliveryCountryCode:'KW'})),{}));
test('missing coordinate must not be sent',()=>assert.deepEqual(coordinates({...saved,latitude:undefined},input()),{}));
test('missing delivery address must not reuse GPS',()=>assert.deepEqual(coordinates(saved,input({deliveryAddress:''})),{}));
