const CACHE='foon-public-shell-v1';
const OFFLINE='/offline';
const staticAsset=url=>url.origin===self.location.origin&&(url.pathname.startsWith('/_next/static/')||url.pathname.startsWith('/pwa/'));
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE),response=await fetch(OFFLINE,{cache:'reload'});if(!response.ok)throw Error('Offline shell unavailable');await cache.put(OFFLINE,response.clone());const html=await response.text(),assets=[...html.matchAll(/(?:src|href)="([^" ]+)"/g)].map(m=>new URL(m[1].replace(/&amp;/g,'&'),self.location.origin)).filter(staticAsset);await Promise.all(assets.map(async url=>{const response=await fetch(url.href);if(response.ok)await cache.put(url.href,response)}));await cache.addAll(['/pwa/icon-192.png','/pwa/icon-512.png']);})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('foon-public-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})())});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 // Never cache APIs, customer details, authenticated HTML or mutations.
 if(url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).then(async response=>{if(response.status>=500)return await caches.match(OFFLINE)||response;if(url.pathname===OFFLINE&&response.ok){const cache=await caches.open(CACHE);await cache.put(OFFLINE,response.clone())}return response}).catch(async()=>await caches.match(OFFLINE)||Response.error()));return}
 if(staticAsset(url)){event.respondWith((async()=>{const cache=await caches.open(CACHE),saved=await cache.match(request);if(saved)return saved;const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response})())}
});
