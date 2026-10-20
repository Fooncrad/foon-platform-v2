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
 for(const phrase of ["e.tenant_id=t.tenant_id","e.branch_id=t.branch_id","t.tenant_id=?","t.branch_id=?","e.status='active'","t.kind='dining_table'","s.kind='dining_section'","'$.waiterId'"]){
  assert(query.includes(phrase),phrase);
 }
});
