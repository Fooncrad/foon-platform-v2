import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../app/api/customer/delivery-preferences/route.ts",import.meta.url),"utf8");

test("address lookup skips SQL when no delivery countries are allowed",()=>{
 assert.match(source,/const \[addresses\]=countries\.length\?await db\.execute/);
 assert.match(source,/\:\[\[\] as RowDataPacket\[\]\]/);
});

test("address lookup binds user and each eligible country",()=>{
 assert.match(source,/WHERE user_id=\? AND country_code IN \(/);
 assert.match(source,/countries\.map\(\(\)=>"\?"\)\.join\(","\)/);
 assert.match(source,/\[user,\.\.\.countries\]/);
});

test("route keeps employee exclusion and tenant-customer membership checks",()=>{
 assert.match(source,/employeePersonalAccessDenied\(\)/);
 assert.match(source,/JOIN tenant_customers c ON c\.tenant_id=t\.id AND c\.user_id=\?/);
 assert.match(source,/STORE_CUSTOMER_REQUIRED/);
});
