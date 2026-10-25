import test from "node:test";
import assert from "node:assert/strict";
import {normalizeEmployeePermissions,parseEmployeeProvisionPatch,validPermissions} from "../lib/restaurant/employee-permissions.ts";

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
test("password-only employee update leaves grants unchanged",()=>{
 assert.deepEqual(parseEmployeeProvisionPatch({password:"123456789"}),{password:"123456789"});
});
test("permissions-only update allows replacing grants",()=>{
 assert.deepEqual(parseEmployeeProvisionPatch({permissions:["orders.view"]}),{permissions:["orders.view"]});
});
test("explicit empty grants clear permissions and combined updates are accepted",()=>{
 assert.deepEqual(parseEmployeeProvisionPatch({permissions:[]}),{permissions:[]});
 assert.deepEqual(parseEmployeeProvisionPatch({permissions:["pos.view"],password:"123456789"}),{permissions:["pos.view"],password:"123456789"});
});
test("employee PATCH rejects no-op, malformed grants, and invalid passwords",()=>{
 for(const value of [null,undefined,[],{},"bad",{tenantId:"x",resourceId:"y"},{permissions:null},{permissions:["owner"]},{permissions:["orders.view","orders.view"]},{password:3},{password:"short"},{password:"x".repeat(129)},{permissions:undefined},{password:undefined}]){
  assert.equal(parseEmployeeProvisionPatch(value),null);
 }
});
