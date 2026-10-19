// Reserve site sections and every registered activity dashboard root.
// Public merchant slugs must not shadow /car, /fashion, /grocery, etc.
const reserved=new Set([
 "admin","api","login","register","account","customer","dashboard","restaurant",
 "menu","auth","settings","creator","creators","help","about","contact","terms",
 "privacy","p","favicon.ico","market","business","workspace","store",
 "driver","staff","cashier","waiter","kitchen","accountant","offline",
 "verify-email","forgot-password","reset-password","employee-invite","receipts",
 "cafe","sweets","grocery","fashion","perfume","accessories","watches",
 "gifts","ecommerce","carwash","car","laundry","salon","contracting"
]);
export function validStoreSlug(value){
 return typeof value==="string"
  &&/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/.test(value)
  &&!reserved.has(value);
}
