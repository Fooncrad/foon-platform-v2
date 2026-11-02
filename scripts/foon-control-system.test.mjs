import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const css=readFileSync(new URL("../app/restaurant/foon-control-system.css",import.meta.url),"utf8");
const merchant=readFileSync(new URL("../app/restaurant/merchant-dashboard.tsx",import.meta.url),"utf8");
const customer=readFileSync(new URL("../app/customer/page.tsx",import.meta.url),"utf8");
test("dashboard shared controls provide keyboard focus and touch targets",()=>{
 assert.match(css,/:focus-visible/);
 assert.match(css,/44px/);
 assert.match(css,/:disabled/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.restaurantApp,\.customerDashboard/);
});
test("both portals load shared design tokens without forcing storefront",()=>{
 assert.match(merchant,/import "\.\.\/restaurant\/foon-control-system\.css";/);
 assert.match(customer,/import "\.\.\/restaurant\/foon-control-system\.css";/);
 assert.doesNotMatch(css,/\.publicMenu|\.storefrontCart/);
});
