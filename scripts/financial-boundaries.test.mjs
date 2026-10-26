import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("customer invoice archive is bound to customer, order, and tenant",()=>{
 const source=read("app/api/customer/invoices/route.ts");
 assert.match(source,/i\.customer_user_id=\? AND o\.customer_user_id=\?/);
 assert.match(source,/i\.customer_user_id=o\.customer_user_id/);
 assert.match(source,/o\.tenant_id=i\.tenant_id/);
 assert.match(source,/private, no-store/);
});
test("personal payments only charge an order owned by the signed-in customer",()=>{
 const api=read("app/api/customer/payments/route.ts");
 const checkout=read("lib/payments/customer-checkout.ts");
 assert.match(api,/userId:user,orderId:body\.orderId/);
 assert.match(checkout,/o\.id=\? AND o\.customer_user_id=\?/);
 assert.match(checkout,/s\.tenant_id=\?/);
});
test("business subscription requests require tenant owner membership and tenant-scoped payment records",()=>{
 const api=read("app/api/tenant/subscription-requests/route.ts");
 assert.match(api,/requireTenantMembership\(user,id,\["owner"\],false\)/);
 assert.match(api,/WHERE tenant_id=\? AND status='pending'/);
 assert.match(api,/INSERT INTO platform_payment_requests\(id,tenant_id,plan_id/);
 assert.match(api,/JOIN platform_payment_requests p ON p\.id=r\.payment_request_id AND p\.tenant_id=r\.tenant_id/);
});
