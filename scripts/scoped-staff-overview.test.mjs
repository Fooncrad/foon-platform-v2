import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {scopedStaffOverview} from "../lib/restaurant/scoped-staff-overview.ts";

test("an unassigned waiter or driver gets no operational aggregates",()=>{
 const result=scopedStaffOverview([]);
 assert.equal(result.summary.orders,0);
 assert.equal(result.summary.tables,0);
 assert.equal(result.summary.outstandingOrders,0);
 assert.equal(result.summary.waiterCalls,0);
 assert.equal(result.summary.reservations,0);
 assert.equal(result.summary.sales,null);
 assert.equal(result.summary.average,null);
 assert.deepEqual(result.attention,{});
 assert.deepEqual(result.series,[]);
});

test("only already-scoped order statuses feed staff counters",()=>{
 const rows=[
  {id:"mine-1",status:"new",table_id:"table-a"},
  {id:"mine-2",status:"ready",table_id:"table-a"},
  {id:"mine-3",status:"preparing",table_id:"table-b"},
  {id:"mine-4",status:"completed",table_id:"table-c"}
 ];
 const r=scopedStaffOverview(rows);
 assert.equal(r.summary.orders,4);
 assert.equal(r.summary.outstandingOrders,3);
 assert.equal(r.summary.newOrders,1);
 assert.equal(r.summary.preparing,1);
 assert.equal(r.summary.ready,1);
 assert.equal(r.summary.tables,2);
 assert.equal(r.summary.sales,null);
 assert.equal(r.summary.average,null);
 assert.equal(r.orders,rows);
});

test("restricted waiter and driver overview returns before global SQL queries",()=>{
 const src=readFileSync(new URL("../app/api/restaurant/operations/[module]/route.ts",import.meta.url),"utf8");
 const start=src.indexOf("async function overview(");
 const global=src.indexOf("const [[summary]]=await db.execute",start);
 const restricted=src.indexOf('if(role==="waiter"||role==="driver")return scopedStaffOverview(await ordersRows(db,tenantId,role,branch,actorUserId));',start);
 assert.ok(start>=0 && restricted>start && restricted<global);
 assert.match(src.slice(0,start),/import \{scopedStaffOverview\} from "@\/lib\/restaurant\/scoped-staff-overview"/);
});

test("kitchen and managerial overview retains existing global branch summary logic",()=>{
 const src=readFileSync(new URL("../app/api/restaurant/operations/[module]/route.ts",import.meta.url),"utf8");
 const i=src.indexOf("async function overview("),j=src.indexOf("async function availableTables(",i);
 const fn=src.slice(i,j);
 assert.match(fn,/const financial=\["owner","manager","cashier","accountant"\]\.includes\(role\)/);
 assert.match(fn,/return \{attention,summary:/);
});
