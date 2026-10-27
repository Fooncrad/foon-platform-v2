import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';

test('real service worker: never cache private workspace HTML; offline reload fails closed',async t=>{
 const worker=await readFile(new URL('../public/foon-offline-sw.js',import.meta.url));let signedIn=true;
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/foon-offline-sw.js'){res.writeHead(200,{'content-type':'application/javascript'});res.end(worker);return;}
  if(url.pathname==='/offline'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end('<h1>OFFLINE SHELL</h1>');return;}
  if(url.pathname==='/_next/static/chunks/app-abc123.js'){res.writeHead(200,{'content-type':'application/javascript'});res.end('document.body.dataset.hydrated="true";');return;}
  if(req.method==='POST'&&url.pathname==='/api/auth/logout'){signedIn=false;res.writeHead(303,{location:'/login'});res.end();return;}
  if(url.pathname==='/login'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end('<h1>LOGIN</h1>');return;}
  if(url.pathname==='/api/restaurant/operations/pos'){res.writeHead(200,{'content-type':'application/json'});res.end('{}');return;}
  if(['/restaurant','/restaurant/pos','/cafe'].includes(url.pathname)){
   if(!signedIn){res.writeHead(307,{location:'/login'});res.end();return;}
   res.writeHead(200,{'content-type':'text/html;charset=utf-8','set-cookie':'test-auth=private; Path=/'});
   res.end(`<html><body><h1>POS ${url.pathname} ${url.searchParams.get('tenant')??''}</h1><div>alice@example.test</div><script src="/_next/static/chunks/app-abc123.js"></script><script>navigator.serviceWorker.register('/foon-offline-sw.js',{scope:'/'})</script></body></html>`);return;
  }
  res.writeHead(404);res.end('missing');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await chromium.launch({headless:true});const context=await browser.newContext();const page=await context.newPage();
 try{
  await page.goto(origin+'/restaurant/pos?tenant=A');
  await page.waitForFunction(()=>navigator.serviceWorker.ready.then(()=>true));
  await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  assert.equal(await page.locator('h1').textContent(),'POS /restaurant/pos A');
  assert.equal(await page.getByText('alice@example.test').count(),1);
  // Static hashed JS may be retained, but signed-in HTML must never be retained.
  await page.waitForFunction(async()=>!!await (await caches.open('foon-next-static-v1')).match('/_next/static/chunks/app-abc123.js'));
  assert.equal(await page.evaluate(()=>caches.has('foon-workspace-pages-v1')),false);
  // Mimic stale private caches left by an older worker: even in an outage,
  // protected URLs must not return this content and the legacy cache is purged.
  await page.evaluate(async()=>{const cache=await caches.open('foon-workspace-pages-v1');await cache.put('/restaurant/pos?tenant=A',new Response('<h1>PRIVATE ALICE</h1>',{headers:{'content-type':'text/html','x-foon-saved':String(Date.now())}}));});
  await context.setOffline(true);
  await page.reload();
  assert.equal(await page.locator('h1').textContent(),'OFFLINE SHELL');
  assert.equal((await page.content()).includes('PRIVATE ALICE'),false);
  assert.equal((await page.content()).includes('alice@example.test'),false);
  assert.equal(await page.evaluate(()=>caches.has('foon-workspace-pages-v1')),false);
  await page.goto(origin+'/cafe?tenant=B');assert.equal(await page.locator('h1').textContent(),'OFFLINE SHELL');
  assert.equal(await page.evaluate(()=>fetch('/api/restaurant/operations/pos').then(()=>'online',()=>'failed')),'failed');
  await context.setOffline(false);
  await page.goto(origin+'/restaurant/pos?tenant=A');
  assert.equal(await page.locator('h1').textContent(),'POS /restaurant/pos A');
  await page.evaluate(()=>fetch('/api/auth/logout',{method:'POST',redirect:'manual'}).then(()=>null));
  await page.goto(origin+'/restaurant/pos?tenant=A');
  assert.equal(await page.locator('h1').textContent(),'LOGIN');
  assert.equal(await page.evaluate(()=>caches.has('foon-workspace-pages-v1')),false);
 }finally{await browser.close();}
});
