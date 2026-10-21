import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';
import {offlineMenuDocument} from '../lib/restaurant/offline-menu.ts';
const menu=slug=>({slug,name:slug,branding:{brandName:slug,coverUrl:'/api/restaurant/assets/33333333-3333-3333-3333-333333333333',openingHours:'8AM–10PM',phone:'12345'},categories:[{id:'food',name:'أطباق',nameEn:'Food',nameFr:'Plats',imageUrl:'/api/restaurant/assets/33333333-3333-3333-3333-333333333333'}],branches:[{id:'one',name:'الأول'},{id:'two',name:'الثاني'}],customerEmail:'PRIVATE@example.test',signedIn:true,items:[{id:'1',name:'طبق '+slug,nameEn:'Dish '+slug,nameFr:'Plat '+slug,description:'وصف',descriptionEn:'Description',descriptionFr:'Description française',price:12,oldPrice:19,branchId:'one',categoryId:'food',imageUrl:'/api/restaurant/assets/11111111-1111-1111-1111-111111111111',images:['/api/restaurant/assets/11111111-1111-1111-1111-111111111111','/api/restaurant/assets/22222222-2222-2222-2222-222222222222'],calories:200,quantity:3,nutrition:'بروتين',nutritionEn:'Protein',nutritionFr:'Protéines',allergens:'milk'},{id:'2',name:'فرع آخر',price:20,description:'',branchId:'two',categoryId:'food',imageUrl:null,allergens:''}],options:{'1':[{id:'size',name:'الحجم',nameEn:'Size',nameFr:'Taille',type:'single',required:false,min:0,max:1,values:[{id:'large',name:'كبير',nameEn:'Large',nameFr:'Grand',price:2.5,imageUrl:'/api/restaurant/assets/22222222-2222-2222-2222-222222222222'}]}]}});
test('public snapshot excludes customer fields and escapes executable markup',()=>{
 const data=menu('alpha');data.name='</script><img src=x onerror=alert(1)>';data.items[0].description='</script><script>BAD()</script>';
 const html=offlineMenuDocument(data);
 assert(!html.includes('PRIVATE@example.test'));assert(!html.includes('signedIn'));assert(!html.includes('<script>BAD()'));
 assert(html.includes('\\u003c/script>'));assert(html.includes('form-action \'none\'')===false);
});
test('real service worker: tenant isolation, offline reload, images, languages, search and no ordering',async t=>{
 const worker=await readFile(new URL('../public/foon-offline-sw.js',import.meta.url));let removed=false;
 const server=createServer((req,res)=>{
  if(req.url==='/foon-offline-sw.js'){res.writeHead(200,{'content-type':'application/javascript'});res.end(worker);return;}
  if(req.url.startsWith('/api/restaurant/assets/')){res.writeHead(200,{'content-type':'image/png'});res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1kAAAAASUVORK5CYII=','base64'));return;}
  if(req.url==='/alpha'&&removed){res.writeHead(404);res.end('Removed');return;}
  const slug=req.url.split('/')[1];res.writeHead(200,{'content-type':'text/html;charset=utf-8'});
  const data=menu(slug),snapshot=offlineMenuDocument(data);
  res.end(`<html><body>ONLINE PRIVATE ACCOUNT<script>navigator.serviceWorker.register('/foon-offline-sw.js',{scope:'/'}).then(()=>navigator.serviceWorker.ready).then(r=>{const channel=new MessageChannel();channel.port1.onmessage=event=>{if(event.data?.ok)document.body.dataset.menuSaved='true';channel.port1.close();};r.active.postMessage(${JSON.stringify({type:'SAVE_PUBLIC_MENU',slug,html:snapshot,images:[...data.items[0].images,data.branding.coverUrl]}).replace(/</g,'\\u003c')},[channel.port2]);});</script></body></html>`);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:320,height:700}});const page=await context.newPage();
 try{
  // A cache entry can appear before the save event finishes its image writes and cleanup.
  // Match the production UI: wait for the worker's acknowledgement before navigating away.
  for(const slug of ['alpha','bravo']){await page.goto(origin+'/'+slug);await page.waitForFunction(()=>document.body.dataset.menuSaved==='true');await page.waitForFunction(async slug=>!!await (await caches.open('foon-public-menu-v1')).match('/'+slug),slug);}
  await page.waitForFunction(async()=>!!await (await caches.open('foon-public-menu-v1')).match('/api/restaurant/assets/11111111-1111-1111-1111-111111111111'));
  await page.reload();await page.waitForFunction(()=>document.body.dataset.menuSaved==='true');await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.waitForFunction(async()=>{const cache=await caches.open('foon-public-menu-v1');return !!(await cache.match('/alpha'));});await context.setOffline(true);await page.goto(origin+'/alpha?table=private');
  assert.equal(await page.locator('h1').textContent(),'alpha');assert(!(await page.content()).includes('PRIVATE@example.test'));assert.equal(await page.locator('article').count(),1);
  assert.equal(await page.locator('form').count(),0);assert.equal(await page.locator('a').count(),0);assert.equal(await page.locator('article .photo img').evaluate(i=>i.complete&&i.naturalWidth>0),true);
  await page.selectOption('#language','en');assert.equal(await page.locator('article h2').textContent(),'Dish alpha');
  await page.locator('article .details button').click();
  assert.equal(await page.locator('#product-dialog').evaluate(d=>d.open),true);
  assert.equal(await page.locator('#thumbs button').count(),2);
  assert.match(await page.locator('#modal-body').textContent(),/Protein/);
  assert.match(await page.locator('#modal-price').textContent(),/19\.00/);
  assert.equal(await page.locator('#order-disabled').isDisabled(),true);
  await page.locator('#modal-body .option input').check();
  assert.match(await page.locator('#modal-price strong').textContent(),/14\.50/);
  await page.locator('#close').click();
  await page.selectOption('#language','fr');assert.equal(await page.locator('article h2').textContent(),'Plat alpha');
  await page.selectOption('#language','en');await page.fill('#search','absent');assert.equal(await page.locator('article').count(),0);await page.fill('#search','');await page.selectOption('#branch','two');assert.equal(await page.locator('article h2').textContent(),'فرع آخر');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.locator('#cover img').count(),1);
  await page.reload();assert.equal(await page.locator('h1').textContent(),'alpha');
  await page.goto(origin+'/bravo');assert.equal(await page.locator('h1').textContent(),'bravo');assert(!(await page.locator('h2').textContent()).includes('alpha'));
  await assert.rejects(page.goto(origin+'/alpha/login'));
  await context.setOffline(false);removed=true;await page.goto(origin+'/alpha');assert.equal(await page.locator('body').textContent(),'Removed');await context.setOffline(true);await assert.rejects(page.goto(origin+'/alpha'));
 }finally{await browser.close();}
});

