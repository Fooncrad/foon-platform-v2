import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {customerOrderLink} from "../lib/platform/customer-order-journey.mjs";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("only valid server UUIDs produce customer order tracking links",()=>{
 const id="123e4567-e89b-42d3-a456-426614174000";
 assert.equal(customerOrderLink(id),"/customer#customer-order-"+id);
 for(const invalid of ["",42,"../admin",null,undefined,"x".repeat(36),id+"?redirect=/admin"])
  assert.equal(customerOrderLink(invalid),null);
});

test("ordered stores are pinned in the logged-in customer's own account",()=>{
 const page=source("app/customer/page.tsx");
 assert.match(page,/FROM tenant_customers c JOIN tenants t/);
 assert.match(page,/FROM restaurant_orders WHERE customer_user_id=\?/);
 assert.match(page,/history\.last_order_at DESC/);
 assert.match(page,/COALESCE\(history\.order_count,0\)/);
 assert.match(page,/WHERE c\.user_id=\?/);
 assert.match(page,/id="customer-stores"/);
 assert.match(page,/publicStorefrontUrl\(String\(store\.slug\)\)/);
 assert.match(page,/id=\{"customer-order-"\+String\(order\.id\)\}/);
 assert.match(page,/publicStorefrontUrl\(String\(order\.store_slug\)\)/);
});

test("merchant and restaurant checkouts expose tracking only after successful order persistence",()=>{
 for(const path of ["app/[slug]/storefront-cart.tsx","app/[slug]/public-menu.tsx"]){
  const src=source(path);
  assert.match(src,/customerOrderLink\((?:body|data)\.id\)/,path);
  assert.match(src,/setCompletedOrderId\(String\((?:body|data)\.id\)\)/,path);
  assert.match(src,/customerOrderLink\(completedOrderId\)/,path);
  assert.match(src,/\/api\/customer\/orders/,path);
 }
});

test("service orders are separate and linked to customer's service-request history",()=>{
 const activity=source("app/[slug]/activity-storefront.tsx");
 const services=source("app/[slug]/service-request-action.tsx");
 assert.match(activity,/href="\/customer#customer-orders"/);
 assert.match(services,/href="\/customer#customer-service-requests"/);
 assert.match(services,/\/api\/customer\/service-requests/);
});
