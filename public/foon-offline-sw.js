const CACHE="foon-pos-shell-v5";
const SHELL=["/offline","/foon-offline-pos.html","/foon-offline-pos.js"];
const MENU_CACHE="foon-public-menu-v1",MAX_AGE=7*86400000;
// These roots belong to authenticated dashboards, never to public cached menus.
// Keep activity aliases aligned with ACTIVITY_ROUTE_SLUGS in lib/tenant/workspace-routes.ts.
const privateRoots=new Set(["restaurant","cafe","sweets","grocery","fashion","perfume","accessories","watches","gifts","ecommerce","carwash","car","laundry","salon","contracting","workspace","business","driver","account","customer","admin","login","register","employee-invite","forgot-password","reset-password","verify-email","receipts"]);
const privatePage=path=>privateRoots.has(path.split("/")[1]);
const reserved=new Set([...privateRoots,"dashboard","menu","auth","settings","creator","creators","help","about","contact","terms","privacy","p","s"]);
async function clearPrivateHtmlCaches(){
 const names=await caches.keys();
 await Promise.all(names.filter(name=>name.startsWith("foon-workspace-pages-")).map(name=>caches.delete(name)));
}
async function requireSecurePosReauth(){
 if(!self.indexedDB)return;
 // Keep encrypted unsent orders; only invalidate the local authorization grant.
 await new Promise(resolve=>{
  const open=indexedDB.open("foon-pos-secure-v1",1);
  open.onupgradeneeded=()=>{
   for(const store of ["profiles","orders"])if(!open.result.objectStoreNames.contains(store))open.result.createObjectStore(store,{keyPath:"id"});
  };
  open.onerror=()=>resolve();
  open.onsuccess=()=>{
   const database=open.result;
   if(!database.objectStoreNames.contains("profiles")){database.close();resolve();return;}
   const tx=database.transaction("profiles","readwrite");
   const cursor=tx.objectStore("profiles").openCursor();
   cursor.onsuccess=()=>{
    const item=cursor.result;
    if(!item)return;
    item.update({...item.value,reauthRequired:true});item.continue();
   };
   tx.oncomplete=()=>{database.close();resolve();};
   tx.onerror=()=>{database.close();resolve();};
   tx.onabort=()=>{database.close();resolve();};
  };
 });
}
function menuSlug(path){const match=path.match(/^\/(?:menu\/)?([a-z0-9][a-z0-9-]{1,118}[a-z0-9])\/?$/);return match&&!reserved.has(match[1])?match[1]:null;}
const publicImage=path=>/^\/api\/restaurant\/assets\/[a-f0-9-]{36}$/i.test(path);
self.addEventListener("message",event=>{
 const data=event.data;
 if(data?.type!=="SAVE_PUBLIC_MENU"||typeof data.html!=="string"||data.html.length>2000000||menuSlug("/"+data.slug)!==data.slug)return;
 event.waitUntil((async()=>{
  const client=await self.clients.get(event.source?.id);if(!client)return;
  const source=new URL(client.url);if(source.origin!==self.location.origin||!(["/"+data.slug,"/"+data.slug+"/order","/menu/"+data.slug].includes(source.pathname)))return;
  const cache=await caches.open(MENU_CACHE),saved=String(Date.now());
  await cache.put("/"+data.slug,new Response(data.html,{headers:{"content-type":"text/html;charset=utf-8","x-foon-saved":saved,"content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; connect-src 'none'"}}));
  let bytes=0;for(const path of [...new Set(Array.isArray(data.images)?data.images:[])].slice(0,40)){
   if(typeof path!=="string"||!publicImage(path))continue;
   try{const response=await fetch(path,{credentials:"omit",redirect:"error"});if(!response.ok||!/^image\/(png|jpeg|webp)$/.test(response.headers.get("content-type")??""))continue;const body=await response.arrayBuffer();if(body.byteLength>2000000||bytes+body.byteLength>20000000)continue;bytes+=body.byteLength;await cache.put(path,new Response(body,{headers:{"content-type":response.headers.get("content-type"),"x-foon-saved":saved}}));}catch{/* Text browsing remains available when an image cannot be saved. */}
  }
  const keys=await cache.keys();for(const key of keys){const response=await cache.match(key);if(Date.now()-Number(response.headers.get("x-foon-saved")||0)>MAX_AGE)await cache.delete(key);}
  const remaining=await cache.keys();for(const group of [remaining.filter(k=>publicImage(new URL(k.url).pathname)),remaining.filter(k=>!publicImage(new URL(k.url).pathname))]){
   const limit=publicImage(new URL(group[0]?.url??self.location.origin).pathname)?80:20;
   for(const key of group.slice(0,Math.max(0,group.length-limit)))await cache.delete(key);
  }
  event.ports[0]?.postMessage({ok:true});
 })());
});
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("foon-pos-shell-")&&key!==CACHE).map(key=>caches.delete(key)))).then(clearPrivateHtmlCaches).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{
 const request=event.request;
 const url=new URL(request.url);
 if(request.method==="POST"&&url.origin===self.location.origin&&["/api/auth/login","/api/auth/logout"].includes(url.pathname)){
  event.waitUntil((async()=>{
   await clearPrivateHtmlCaches();
   await requireSecurePosReauth();
   const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
   for(const client of clients)client.postMessage({type:"FOON_AUTH_CHANGED"});
  })());return;
 }
 if(request.method!=="GET")return;
 // Only these data-free static files may be served offline. Private SSR/RSC and
 // API responses are never stored, even if an activity alias resembles a menu.
 if(url.origin===self.location.origin&&["/foon-offline-pos.html","/foon-offline-pos.js"].includes(url.pathname)){
  event.respondWith((async()=>{
   const cached=await caches.match(url.pathname);
   if(self.navigator.onLine===false&&cached)return cached;
   try{return await fetch(request,{cache:"no-store"});}
   catch{return cached??Response.error();}
  })());return;
 }
 if(url.origin===self.location.origin&&publicImage(url.pathname)&&request.destination==="image"){
  event.respondWith(fetch(request).catch(async()=>{const saved=await (await caches.open(MENU_CACHE)).match(url.pathname);return saved&&Date.now()-Number(saved.headers.get("x-foon-saved")||0)<=MAX_AGE?saved:Response.error();}));return;
 }
 if(request.mode!=="navigate")return;
 // Private navigation is network-only. Never store or replay SSR/RSC HTML.
 if(url.origin===self.location.origin&&privatePage(url.pathname)){
  event.respondWith((async()=>{
   await clearPrivateHtmlCaches();
   try{return await fetch(request,{cache:"no-store"});}
   catch{return await caches.match("/offline")??Response.error();}
  })());return;
 }
 const slug=url.origin===self.location.origin?menuSlug(url.pathname):null;
 if(slug){event.respondWith((async()=>{
  const cache=await caches.open(MENU_CACHE);
  const fallback=async()=>{const saved=await cache.match("/"+slug);return saved&&Date.now()-Number(saved.headers.get("x-foon-saved")||0)<=MAX_AGE?saved:null;};
  // When the browser already knows it is offline, avoid a doomed network navigation.
  if(self.navigator.onLine===false){const saved=await fallback();if(saved)return saved;}
  try{const response=await fetch(request);if(response.status===404||response.status===410)await cache.delete("/"+slug);return response;}
  catch{return await fallback()??Response.error();}
 })());return;}
 if(url.origin!==self.location.origin||url.pathname!=="/offline")return;
 event.respondWith((async()=>{
  try{const response=await fetch(request);if(response.ok&&url.pathname==="/offline"&&response.headers.get("content-type")?.includes("text/html")){const cache=await caches.open(CACHE);await cache.put(request,response.clone());}return response;}
  catch{return await caches.match("/offline")??Response.error();}
 })());
});
