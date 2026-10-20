import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/foon-offline-sw.js',import.meta.url),'utf8');
const origin='https://nfoodz.example';
function fakeWorker(online=false){
 const handlers={};const buckets=new Map();const fetches=[];
 const key=value=>new URL(typeof value==='string'?value:value.url,origin).href;
 const caches={
  async open(name){if(!buckets.has(name))buckets.set(name,new Map());const b=buckets.get(name);return {
   async put(url,response){b.set(key(url),response.clone());},
   async match(url){return b.get(key(url))?.clone();},
   async delete(url){return b.delete(key(url));},
   async keys(){return [...b.keys()].map(url=>({url}));},
   async addAll(paths){for(const path of paths)await this.put(path,new Response('<h1>OFFLINE SHELL</h1>',{headers:{'content-type':'text/html'}}));}
  };},
  async keys(){return [...buckets.keys()];},
  async delete(name){return buckets.delete(name);},
  async match(url){for(const name of buckets.keys()){const b=await this.open(name),found=await b.match(url);if(found)return found;}return undefined;},
  async has(name){return buckets.has(name);}
 };
 const self={location:{origin},navigator:{onLine:online},clients:{claim:async()=>{},get:async()=>null},skipWaiting:async()=>{},addEventListener(name,handler){handlers[name]=handler;}};
 const fetch=async(request,options)=>{fetches.push({url:request.url||request,options});if(!online)throw Error('offline');return new Response('<h1>PRIVATE ALICE</h1>',{headers:{'content-type':'text/html'}});};
 vm.runInNewContext(source,{self,caches,fetch,URL,Response,Date,Set,Promise,console});
 async function fire(type,request){const pending=[];let response;const event={request,waitUntil(promise){pending.push(promise);},respondWith(promise){response=Promise.resolve(promise);}};handlers[type](event);const value=response?await response:undefined;await Promise.all(pending);return value;}
 return {fire,caches,fetches};
}
const request=(url,method='GET',mode='navigate')=>({url:origin+url,method,mode,destination:'document'});

test('offline navigation never replays private HTML on any activity or account route',async()=>{
 const sw=fakeWorker(false);await (await sw.caches.open('foon-pos-shell-v3')).put('/offline',new Response('<h1>OFFLINE SHELL</h1>'));
 const old=await sw.caches.open('foon-workspace-pages-v1');await old.put('/cafe?tenant=A',new Response('<p>ALICE PRIVATE CUSTOMER</p>'));
 const publicCache=await sw.caches.open('foon-public-menu-v1');
 await publicCache.put('/cafe',new Response('<p>STOREFRONT CACHED, NOT THE DASHBOARD</p>',{headers:{'x-foon-saved':String(Date.now())}}));
 const roots=['restaurant','cafe','sweets','grocery','fashion','perfume','accessories','watches','gifts','ecommerce','carwash','car','laundry','salon','contracting','workspace','business','driver','account','customer','admin','login','register','employee-invite','forgot-password','reset-password','verify-email','receipts'];
 for(const route of roots){const response=await sw.fire('fetch',request('/'+route+'?tenant=A'));assert.equal(await response.text(),'<h1>OFFLINE SHELL</h1>',route);}
 assert.equal(await sw.caches.has('foon-workspace-pages-v1'),false);
 assert.equal(await (await publicCache.match('/cafe')).text(),'<p>STOREFRONT CACHED, NOT THE DASHBOARD</p>');
});

test('private online requests bypass the HTTP cache and never cache SSR HTML',async()=>{
 const sw=fakeWorker(true);
 const response=await sw.fire('fetch',request('/salon?tenant=B'));
 assert.equal(await response.text(),'<h1>PRIVATE ALICE</h1>');
 assert.equal(sw.fetches.length,1);
 assert.equal(sw.fetches[0].options.cache,'no-store');
 assert.deepEqual(await sw.caches.keys(),[]);
});

test('activation purges all legacy private HTML caches while retaining public menu',async()=>{
 const sw=fakeWorker(false);
 await (await sw.caches.open('foon-workspace-pages-v1')).put('/restaurant',new Response('SECRET'));
 await (await sw.caches.open('foon-workspace-pages-v7')).put('/salon',new Response('SECRET'));
 await (await sw.caches.open('foon-pos-shell-v2')).put('/offline',new Response('OLD SHELL'));
 await (await sw.caches.open('foon-public-menu-v1')).put('/alpha',new Response('PUBLIC MENU'));
 await sw.fire('activate');
 assert.equal(await sw.caches.has('foon-workspace-pages-v1'),false);
 assert.equal(await sw.caches.has('foon-workspace-pages-v7'),false);
 assert.equal(await sw.caches.has('foon-pos-shell-v2'),false);
 assert.equal(await sw.caches.has('foon-public-menu-v1'),true);
});

test('login and logout transitions purge legacy private HTML without handling the POST body',async()=>{
 const sw=fakeWorker(true);
 for(const path of ['/api/auth/login','/api/auth/logout']){
  await (await sw.caches.open('foon-workspace-pages-v1')).put('/restaurant',new Response('SECRET'));
  const response=await sw.fire('fetch',request(path,'POST','cors'));
  assert.equal(response,undefined);
  assert.equal(await sw.caches.has('foon-workspace-pages-v1'),false);
 }
});

test('offline public cached menu remains usable, but reserved business aliases are not menu cache keys',async()=>{
 const sw=fakeWorker(false);const publicCache=await sw.caches.open('foon-public-menu-v1');
 await publicCache.put('/alpha',new Response('<h1>PUBLIC ALPHA</h1>',{headers:{'x-foon-saved':String(Date.now())}}));
 const response=await sw.fire('fetch',request('/alpha?language=fr'));
 assert.equal(await response.text(),'<h1>PUBLIC ALPHA</h1>');
});
