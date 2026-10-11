const CACHE="foon-pos-shell-v2";
const SHELL=["/offline"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("foon-pos-shell-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET"||request.mode!=="navigate")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||url.pathname.startsWith("/api/")||url.pathname.startsWith("/admin")||url.pathname.startsWith("/auth"))return;
 if(!url.pathname.startsWith("/restaurant")&&url.pathname!=="/offline")return;
 event.respondWith((async()=>{
  try{const response=await fetch(request);if(response.ok&&response.headers.get("content-type")?.includes("text/html")){const cache=await caches.open(CACHE);await cache.put(request,response.clone());}return response;}
  catch{const cached=await caches.match(request);return cached??await caches.match("/offline")??Response.error();}
 })());
});
