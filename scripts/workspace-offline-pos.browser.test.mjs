import {test} from "@playwright/test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {chromium} from "@playwright/test";

// Test against the actual Service Worker, shell HTML and JS files. No real
// customer, production database, Hostinger session or payment gateway.
const root=new URL("../public/",import.meta.url);
const [html,js,worker]=await Promise.all(["foon-offline-pos.html","foon-offline-pos.js","foon-offline-sw.js"].map(name=>readFile(new URL(name,root))));
const userA="11111111-1111-4111-8111-111111111111",userB="22222222-2222-4222-8222-222222222222";
const tenant="33333333-3333-4333-8333-333333333333",branch="44444444-4444-4444-8444-444444444444";
const itemId="55555555-5555-4555-8555-555555555555",passphrase="unique-secure-local-passphrase-for-fixture";
const orderApi="/api/restaurant/operations/pos";
test("real offline browser: encrypted scoped catalog and order, reload, wrong passphrase and reauthorized sync",async()=>{
 test.setTimeout(90000);
 const checkpoint=label=>console.log("OFFLINE-POS-CHECKPOINT:",label);
 let currentUser=userA,legacyAllowed=true;const posts=[];
 const server=createServer((req,res)=>{
  const uri=new URL(req.url,"http://localhost");
  const send=(status,body,ct="application/json")=>{res.writeHead(status,{"content-type":ct,"cache-control":"no-store"});res.end(body);};
  if(uri.pathname==="/foon-offline-pos.html")return send(200,html,"text/html;charset=utf-8");
  if(uri.pathname==="/foon-offline-pos.js")return send(200,js,"application/javascript;charset=utf-8");
  if(uri.pathname==="/foon-offline-sw.js")return send(200,worker,"application/javascript;charset=utf-8");
  if(uri.pathname==="/offline")return send(200,"<h1>DATA-FREE OFFLINE SHELL</h1>","text/html;charset=utf-8");
  if(req.method==="POST"&&uri.pathname==="/api/auth/logout"){currentUser=userB;return send(200,JSON.stringify({ok:true}));}
  if(uri.pathname==="/api/auth/me")return send(200,JSON.stringify({ok:true,user:{id:currentUser,email:"private-user@example.test"}}));
  if(uri.pathname===orderApi){
   if(currentUser!==userA)return send(403,JSON.stringify({ok:false,code:"ACCESS_DENIED"}));
   if(req.method==="GET")return send(200,JSON.stringify({ok:true,legacyRecoveryAllowed:legacyAllowed,orders:[{customer_name:"PRIVATE-SERVER-CUSTOMER"}],menu:[{id:itemId,name:"Test espresso",status:"active",data:{price:12}}],tables:[{id:"66666666-6666-4666-8666-666666666666",name:"Table 1",status:"available",data:{capacity:4}}],options:{},currency:"SAR"}));
   if(req.method==="POST"){let payload="";req.on("data",data=>payload+=data);req.on("end",()=>{posts.push(JSON.parse(payload));send(200,JSON.stringify({ok:true}));});return;}
  }
  send(404,"missing","text/plain");
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));

 const origin="http://127.0.0.1:"+server.address().port;
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:320,height:720}});
 const page=await context.newPage();
 try{

 const path="/foon-offline-pos.html?tenant="+tenant+"&branch="+branch;
 await page.goto(origin+path);
 await page.evaluate(()=>navigator.serviceWorker.register("/foon-offline-sw.js",{scope:"/"}));
 await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
 await page.fill("#setup-pass",passphrase);
 await page.click("#setup-btn");
 await page.waitForFunction(()=>document.querySelector("#workspace")?.hidden===false);checkpoint("prepared");
 assert((await page.locator("#notice").innerText()).includes("مشفرة"));
 const encrypted=await page.evaluate(async()=>{
  const req=indexedDB.open("foon-pos-secure-v1");const database=await new Promise(resolve=>req.onsuccess=()=>resolve(req.result));
  const trx=database.transaction("profiles","readonly"),all=trx.objectStore("profiles").getAll();
  const list=await new Promise(resolve=>all.onsuccess=()=>resolve(all.result));database.close();return list;
 });
 assert.equal(encrypted.length,1);
 assert(!JSON.stringify(encrypted).includes("PRIVATE-SERVER-CUSTOMER"));
 assert(!JSON.stringify(encrypted).includes("Test espresso"));
 assert(!JSON.stringify(encrypted).includes("private-user@example.test"));
 await page.locator("#catalog .item button").first().click();
 await page.click("#save-order");
 await page.waitForFunction(()=>document.querySelector("#queue")?.textContent.includes("pending"));
 assert.equal(posts.length,0);checkpoint("encrypted-queued");
 await context.setOffline(true);
 await page.reload();
 await page.waitForFunction(()=>document.querySelector("#locked")?.hidden===false);
 await page.fill("#unlock-pass","wrong-password");await page.click("#unlock-btn");
 await page.waitForFunction(()=>document.querySelector("#notice")?.dataset.error==="true");
 assert.equal(await page.locator("#workspace").isHidden(),true);
 await page.fill("#unlock-pass",passphrase);await page.click("#unlock-btn");
 await page.waitForFunction(()=>document.querySelector("#queue")?.textContent.includes("pending"));
 assert.equal(await page.locator("#catalog .item").count(),1);
 checkpoint("offline-reloaded-unlocked");
 await context.setOffline(false);
 currentUser=userB;
 await page.click("#sync-btn");
 await page.waitForFunction(()=>document.querySelector("#notice")?.dataset.error==="true");
 assert.equal(posts.length,0);
 assert((await page.locator("#queue").innerText()).includes("pending"));
 currentUser=userA;
 await page.click("#sync-btn");
 await page.waitForFunction(()=>document.querySelector("#queue")?.textContent.includes("لا توجد طلبات"));
 assert.equal(posts.length,1);
 assert.equal(posts[0].branchId,branch);
 assert.equal(posts[0].requestKey.length,36);
 assert.equal(posts[0].paymentStatus,undefined);
 assert.equal(posts[0].customerName,"");checkpoint("online-synced");
 // Service worker must invalidate the local grant at logout even when the
 // ciphertext remains available for eventual account-scoped recovery.
 await page.evaluate(()=>fetch("/api/auth/logout",{method:"POST"}));checkpoint("logout-requested");
 await page.waitForFunction(async()=>{
  const open=indexedDB.open("foon-pos-secure-v1");const db=await new Promise(resolve=>open.onsuccess=()=>resolve(open.result));
  const tx=db.transaction("profiles","readonly"),req=tx.objectStore("profiles").getAll();
  const rows=await new Promise(resolve=>req.onsuccess=()=>resolve(req.result));db.close();return rows[0]?.reauthRequired===true;
 },{timeout:10000});checkpoint("reauth-flag-persisted");
 await context.setOffline(true);await page.reload();
 await page.waitForFunction(()=>document.querySelector("#locked")?.hidden===false);
 await page.fill("#unlock-pass",passphrase);await page.click("#unlock-btn");
 await page.waitForFunction(()=>document.querySelector("#notice")?.dataset.error==="true");
 assert.equal(await page.locator("#workspace").isHidden(),true);checkpoint("offline-after-logout-blocked");
 await context.setOffline(false);currentUser=userA;
 await page.fill("#unlock-pass",passphrase);await page.click("#unlock-btn");
 await page.waitForFunction(()=>document.querySelector("#workspace")?.hidden===false);
 assert.equal(await page.locator("#catalog .item").count(),1);checkpoint("online-reauthorized");
 // Seed one legacy plaintext order from this tenant/branch and one foreign
 // order on the same shared browser. Only a server-authorized manager may
 // migrate the matching row, retaining its request key and its original time.
 const ownOld="77777777-7777-4777-8777-777777777777";
 const otherOld="88888888-8888-4888-8888-888888888888";
 await page.evaluate(async({tenant,branch,ownOld,otherOld,itemId})=>{
  const open=indexedDB.open("foon-pos-offline-v1",2);
  open.onupgradeneeded=()=>{for(const name of ["orders","snapshots"])if(!open.result.objectStoreNames.contains(name))open.result.createObjectStore(name,{keyPath:"id"});};
  const database=await new Promise((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
  const trans=database.transaction(["orders","snapshots"],"readwrite"),orders=trans.objectStore("orders");
  for(const [id,ownerTenant] of [[ownOld,tenant],[otherOld,"99999999-9999-4999-8999-999999999999"]]){
   orders.put({id,tenantId:ownerTenant,branchId:branch,createdAt:"2026-10-20T08:00:00.000Z",status:"pending",payload:{branchId:branch,requestKey:id,channel:"takeaway",items:[{id:itemId,quantity:2,options:[]}],customerName:"Sensitive legacy guest"}});
  }
  trans.objectStore("snapshots").put({id:tenant+":"+branch,tenantId:tenant,branchId:branch,menu:[{name:"PRIVATE OLD PRODUCT"}]});
  await new Promise((resolve,reject)=>{trans.oncomplete=resolve;trans.onerror=()=>reject(trans.error);});database.close();
 },{tenant,branch,ownOld,otherOld,itemId});
 await page.click("#legacy-recover");
 await page.waitForFunction(()=>document.querySelector("#notice")?.dataset.error==="true");
 await page.check("#legacy-confirm");
 await page.click("#legacy-recover");
 await page.waitForFunction(()=>document.querySelector("#notice")?.textContent.includes("نُقل 1"));
 const results=await page.evaluate(async({ownOld,otherOld,tenant,branch})=>{
  async function read(name,store){const open=indexedDB.open(name);const db=await new Promise(resolve=>open.onsuccess=()=>resolve(open.result));const trx=db.transaction(store,"readonly"),req=trx.objectStore(store).getAll();const rows=await new Promise(resolve=>req.onsuccess=()=>resolve(req.result));db.close();return rows;}
  return {legacy:await read("foon-pos-offline-v1","orders"),snapshots:await read("foon-pos-offline-v1","snapshots"),secure:await read("foon-pos-secure-v1","orders")};
 },{ownOld,otherOld,tenant,branch});
 assert(results.legacy.some(row=>row.id===otherOld));
 assert(!results.legacy.some(row=>row.id===ownOld));
 assert(!results.snapshots.some(row=>row.id===tenant+":"+branch));
 const migrated=results.secure.find(row=>row.orderId===ownOld);
 assert(migrated);
 assert(!JSON.stringify(migrated).includes("Sensitive legacy guest"));
 assert((await page.locator("#queue").innerText()).includes(ownOld));
 // Simulated cashier/ordinary POS operator: GET POS still succeeds, but the
 // server explicitly refuses management of unowned legacy plaintext data.
 legacyAllowed=false;
 await page.check("#legacy-confirm");
 await page.click("#legacy-recover");
 await page.waitForFunction(()=>document.querySelector("#notice")?.textContent.includes("LEGACY_RECOVERY_MANAGER_ONLY"));
 assert.equal(await page.locator("#notice").getAttribute("data-error"),"true");
 await page.uncheck("#legacy-confirm");
 await page.click("#legacy-recover");
 await page.waitForFunction(()=>document.querySelector("#notice")?.dataset.error==="true");
 checkpoint("legacy-plaintext-encrypted-and-isolated");
 }finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test("static shell cannot contain server/customer data or auth tokens",()=>{
 const text=html.toString();assert(text.includes('Content-Security-Policy'));
 assert(!text.includes("PRIVATE-SERVER-CUSTOMER"));
 assert(!text.includes("PRIVATE ALICE"));
 assert(!text.includes("document.cookie"));
 assert(worker.toString().includes("foon-offline-pos.html"));
 assert(worker.toString().includes("foon-offline-pos.js"));
 assert(js.toString().includes("PBKDF2"));
 assert(js.toString().includes("AES-GCM"));
 assert(js.toString().includes("WEB_LOCKS_REQUIRED"));
});
