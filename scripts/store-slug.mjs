// These paths belong to Next.js dashboards and cannot be registered as public storefront slugs.
const reserved=new Set([
 "admin","api","login","register","account","customer","dashboard",
 "restaurant","menu","auth","settings","creator","creators","help",
 "about","contact","terms","privacy","p","favicon.ico",
 "workspace","business","driver","s",
 "cafe","sweets","grocery","fashion","perfume","accessories",
 "watches","gifts","ecommerce","carwash","car","laundry","salon","contracting"
]);
export function validStoreSlug(value,allowReserved=false){
 return typeof value==="string"&&/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/.test(value)
  &&(allowReserved||!reserved.has(value));
}
