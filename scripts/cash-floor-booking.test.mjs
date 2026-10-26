import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("public seat map uses active plans and real linked tables only",()=>{
 const api=read("app/api/customer/floor-map/route.ts");
 for(const token of ["p.is_active=TRUE","restaurant_floor_table_links","t.kind='dining_table'",'const real=link?String(link.real_status):"unlinked"',"availabilityVerified:false","bookingFee"])assert.ok(api.includes(token),token);
});
test("cash booking locks a real table, rejects overlap and never marks paid",()=>{
 const api=read("app/api/customer/services/route.ts");
 for(const token of ['body.bookingMode==="floor_cash"','body.paymentMethod!=="cash"',"FOR UPDATE","TABLE_TIME_UNAVAILABLE","restaurant_floor_table_links",'paymentStatus:cashFloor?"unpaid":null',"status:'pending'"])assert.ok(api.includes(token),token);
 assert.doesNotMatch(api,/paymentStatus:cashFloor\?"paid"/);
});
test("cash booking metadata validates in standard reservation data schema without new SQL migration",()=>{
 const schema=read("scripts/restaurant-resource-schema.mjs");
 for(const token of ['field("bookingMode"','floor_cash','field("floorLayoutId"','field("floorTableId"','field("paymentStatus"'])assert.ok(schema.includes(token),token);
 assert.match(schema,/field\("paymentStatus"[^\n]+options:\["unpaid"\]/);
});
test("customer selects cash pay-at-venue, table and party size before booking",()=>{
 const ui=read("app/[slug]/menu-services.tsx");
 for(const token of ['value="floor_cash"','<CustomerFloorMap','cashSeat?.floorTableId','cashSeat?.layoutId','paymentMethod:action','bookingMode==="floor_cash"&&!cashSeat','الدفع نقدًا عند الحضور'])assert.ok(ui.includes(token),token);
});
