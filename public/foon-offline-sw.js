const CACHE="foon-pos-shell-v2";
const SHELL=["/offline"];
const MENU_CACHE="foon-public-menu-v1",MAX_AGE=7*86400000;
const reserved=new Set(["admin","api","login","register","account","customer","dashboard","restaurant","menu","auth","settings","creator","creators","help","about","contact","terms","privacy","p"]);
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
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("foon-pos-shell-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin===self.location.origin&&publicImage(url.pathname)&&request.destination==="image"){
  event.respondWith(fetch(request).catch(async()=>{const saved=await (await caches.open(MENU_CACHE)).match(url.pathname);return saved&&Date.now()-Number(saved.headers.get("x-foon-saved")||0)<=MAX_AGE?saved:Response.error();}));return;
 }
 if(request.mode!=="navigate")return;
 const slug=url.origin===self.location.origin?menuSlug(url.pathname):null;
 if(slug){event.respondWith((async()=>{const cache=await caches.open(MENU_CACHE);try{const response=await fetch(request);if(response.status===404||response.status===410)await cache.delete("/"+slug);return response;}catch{const saved=await cache.match("/"+slug);return saved&&Date.now()-Number(saved.headers.get("x-foon-saved")||0)<=MAX_AGE?saved:Response.error();}})());return;}
 if(url.origin!==self.location.origin||url.pathname.startsWith("/api/")||url.pathname.startsWith("/admin")||url.pathname.startsWith("/auth"))return;
 if(!url.pathname.startsWith("/restaurant")&&url.pathname!=="/offline")return;
 event.respondWith((async()=>{
  try{const response=await fetch(request);if(response.ok&&url.pathname==="/offline"&&response.headers.get("content-type")?.includes("text/html")){const cache=await caches.open(CACHE);await cache.put(request,response.clone());}return response;}
  catch{return await caches.match("/offline")??Response.error();}
 })());
});
