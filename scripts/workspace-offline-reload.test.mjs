import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';
test('real service worker: signed-in workspace survives offline reload and is cleared on logout',async t=>{
 const worker=await readFile(new URL('../public/foon-offline-sw.js',import.meta.url));let signedIn=true;
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://x');
  if(url.pathname==='/foon-offline-sw.js'){res.writeHead(200,{'content-type':'application/javascript'});res.end(worker);return;}
  if(url.pathname==='/offline'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end('<h1>OFFLINE SHELL</h1>');return;}
  if(url.pathname==='/_next/static/chunks/app-abc123.js'){res.writeHead(200,{'content-type':'application/javascript'});res.end('document.body.dataset.hydrated="true";');return;}
  if(req.method==='POST'&&url.pathname==='/api/auth/logout'){signedIn=false;res.writeHead(303,{location:'/login'});res.end();return;}
  if(url.pathname==='/login'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end('<h1>LOGIN</h1>');return;}
  if(url.pathname==='/api/restaurant/operations/pos'){res.writeHead(200,{'content-type':'application/json'});res.end('{}');return;}
  if(['/restaurant','/restaurant/pos','/cafe'].includes(url.pathname)){
   if(!signedIn){res.writeHead(307,{location:'/login'});res.end();return;}
   res.writeHead(200,{'content-type':'text/html;charset=utf-8','set-cookie':'probe=1; Path=/'});
   res.end(`<html><body><h1>POS ${url.pathname} ${url.searchParams.get('tenant')??''}</h1><script src="/_next/static/chunks/app-abc123.js"></script><script>navigator.serviceWorker.register('/foon-offline-sw.js',{scope:'/'})</script></body></html>`);return;
  }
  res.writeHead(404);res.end('missing');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await chromium.launch({headless:true});const context=await browser.newContext();const page=await context.newPage();
 const savedPages=()=>page.evaluate(async()=>(await (await caches.open('foon-workspace-pages-v1')).keys()).map(r=>new URL(r.url).pathname+new URL(r.url).search));
 try{
  await page.goto(origin+'/restaurant/pos?tenant=A');await page.waitForFunction(()=>!!navigator.serviceWorker.controller||navigator.serviceWorker.ready.then(()=>false));
  await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.goto(origin+'/cafe?tenant=A');await page.goto(origin+'/restaurant/pos?tenant=A');
  assert.deepEqual((await savedPages()).sort(),['/cafe?tenant=A','/restaurant/pos?tenant=A']);
  await context.setOffline(true);
  await page.reload();
  assert.equal(await page.locator('h1').textContent(),'POS /restaurant/pos A');
  await page.waitForFunction(()=>document.body.dataset.hydrated==='true');
  // A different tenant URL is never served another tenant's cached page.
  await page.goto(origin+'/restaurant/pos?tenant=B');assert.equal(await page.locator('h1').textContent(),'OFFLINE SHELL');
  await page.goto(origin+'/restaurant/pos?tenant=A');assert.equal(await page.locator('h1').textContent(),'POS /restaurant/pos A');
  // API calls are not served from the page cache.
  assert.equal(await page.evaluate(()=>fetch('/api/restaurant/operations/pos').then(()=>'online',()=>'failed')),'failed');
  await context.setOffline(false);
  await page.evaluate(()=>fetch('/api/auth/logout',{method:'POST',redirect:'manual'}).then(()=>null));
  await page.waitForFunction(async()=>!(await caches.has('foon-workspace-pages-v1')));
  await context.setOffline(true);
  await page.goto(origin+'/restaurant/pos?tenant=A');assert.equal(await page.locator('h1').textContent(),'OFFLINE SHELL');
  // A signed-out redirect removes the stale entry instead of caching the login page.
  await context.setOffline(false);await page.goto(origin+'/cafe?tenant=A');assert.equal(await page.locator('h1').textContent(),'LOGIN');
  assert.deepEqual(await savedPages(),[]);
 }finally{await browser.close();}
});
