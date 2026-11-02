import assert from "node:assert/strict";
import {test} from "node:test";
import {assignedWaiterTableIds} from "../lib/restaurant/waiter-assignments.ts";
test("unscoped or missing waiter identities cannot query tables",async()=>{
 let calls=0;
 const db={execute:async()=>{calls++;return [[]]}};
 assert.deepEqual(await assignedWaiterTableIds(db,"","branch","user"),[]);
 assert.deepEqual(await assignedWaiterTableIds(db,"tenant","","user"),[]);
 assert.deepEqual(await assignedWaiterTableIds(db,"tenant","branch",""),[]);
 assert.equal(calls,0);
});
test("assigned waiter query is scoped to tenant, branch and linked user",async()=>{
 let query="",params;
 const db={execute:async(sql,values)=>{query=sql;params=values;return [[{id:"table-1"},{id:"table-2"}]];}};
 const ids=await assignedWaiterTableIds(db,"tenant-1","branch-2","waiter-3");
 assert.deepEqual(ids,["table-1","table-2"]);
 assert.deepEqual(params,["waiter-3","tenant-1","branch-2"]);
 assert(query.includes("'null'"),"a JSON null at table level must fall back to the section waiter");
 for(const phrase of ["BINARY e.tenant_id=BINARY t.tenant_id","BINARY e.branch_id=BINARY t.branch_id","BINARY t.tenant_id=BINARY ?","BINARY t.branch_id=BINARY ?","BINARY s.id=BINARY JSON_UNQUOTE","BINARY s.tenant_id=BINARY t.tenant_id","BINARY COALESCE(","BINARY e.id","e.status='active'","t.kind='dining_table'","s.kind='dining_section'","'$.waiterId'"]){
  assert(query.includes(phrase),phrase);
 }
});


test("assigned-service SQL uses binary-safe comparisons for mixed MariaDB collations",async()=>{
 const {readFileSync}=await import("node:fs");
 const src=readFileSync(new URL("../app/api/restaurant/assigned-service/route.ts",import.meta.url),"utf8");
 for(const phrase of [
  "BINARY b.id=BINARY a.branch_id",
  "BINARY b.tenant_id=BINARY a.tenant_id",
  "BINARY a.tenant_id=BINARY ?",
  "BINARY tenant_id=BINARY ? AND BINARY user_id=BINARY ?",
  "BINARY l.tenant_id=BINARY t.tenant_id",
  "BINARY l.dining_table_id=BINARY t.id",
  "BINARY f.id=BINARY l.layout_id",
  "BINARY o.floor_table_id=BINARY l.floor_table_id",
  "BINARY tenant_id=BINARY ? AND BINARY branch_id=BINARY ?"
 ]) assert(src.includes(phrase),phrase);
});



test("floor-plan API lists only active branch-linked waiter employees and persists table assignments",async()=>{
 const {readFileSync}=await import("node:fs");
 const api=readFileSync(new URL("../app/api/restaurant/floor-plan-layouts/route.ts",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../app/restaurant/section-floor-layouts.tsx",import.meta.url),"utf8");
 for(const phrase of [
  "JOIN users u ON BINARY u.id=BINARY JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.userId'))",
  "m.role='waiter'",
  "a.enabled=TRUE AND a.role='waiter'",
  "BINARY e.branch_id=BINARY ?",
  "JSON_SET(data,'$.waiterId',?)",
  "JSON_REMOVE(data,'$.waiterId')",
  "DINING_TABLE_LINK_REQUIRED",
  "DINING_TABLE_BRANCH_SCOPE_REQUIRED",
  "WAITER_NOT_ELIGIBLE_FOR_BRANCH"
 ]) assert(api.includes(phrase),phrase);
 for(const phrase of [
  'operation("waiterAssign"',
  "waiters.map(w=>",
  "Assigned waiter",
  "النادل المعيّن",
  "tableWaiterName(t.id)"
 ]) assert(ui.includes(phrase),phrase);
});
