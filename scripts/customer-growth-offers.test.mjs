import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../app/api/customer/growth-offers/route.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../app/customer/customer-growth-offers.tsx",import.meta.url),"utf8");
test("campaign browsing requires customer authentication and tenant linkage",()=>{
 for(const pattern of [/employeePersonalAccessDenied/,/currentUserId/,/tc\.user_id=\?/,/c\.tenant_id=\?/,/c\.status='active'/,/c\.branch_id IS NULL/,/c\.starts_at<=UTC_TIMESTAMP\(\)/,/c\.ends_at>UTC_TIMESTAMP\(\)/,/LIMIT 20/])assert.match(route,pattern);
 assert.doesNotMatch(route,/export async function POST/);
});
test("preview never claims a coupon has been applied",()=>{
 assert.match(ui,/customer-growth-offers/);
 assert.match(ui,/eligibility is checked at checkout/i);
 assert.match(ui,/ar:\{/);
 assert.match(ui,/en:\{/);
 assert.match(ui,/fr:\{/);
});
