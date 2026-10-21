import test from "node:test";
import assert from "node:assert/strict";
import {normalizeEmployeePermissions,validPermissions} from "../lib/restaurant/employee-permissions.ts";

test("staff grants accept an empty or distinct valid set",()=>{
 assert.deepEqual(normalizeEmployeePermissions([]),[]);
 assert.equal(validPermissions.size,192);
 assert.deepEqual(normalizeEmployeePermissions(["orders.view","tables.manage"]),["orders.view","tables.manage"]);
});
test("staff grants reject duplicate entries before SQL writes",()=>{
 assert.equal(normalizeEmployeePermissions(["orders.view","orders.view"]),null);
});
test("staff grants reject malformed, foreign and excessive inputs",()=>{
 for(const value of [undefined,null,{},"orders.view",["owner"],["orders.view",null],["orders.view",1],Array(193).fill("orders.view")]){
  assert.equal(normalizeEmployeePermissions(value),null);
 }
});
