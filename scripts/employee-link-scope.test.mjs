import test from "node:test";
import assert from "node:assert/strict";
import {employeeMembershipRole,resolveBoundEmployeeUser} from "../lib/restaurant/employee-link-scope.ts";

const tenant="11111111-1111-4111-8111-111111111111";
const branch="22222222-2222-4222-8222-222222222222";
const otherBranch="33333333-3333-4333-8333-333333333333";
const user="44444444-4444-4444-8444-444444444444";
const linked={userId:user,role:"waiter"};
function mockDB({role="waiter",assignedBranch=branch,memberActive=true,enabled=true,userActive=true,customer=false,tenantId=tenant}={}){
 let queries=0;
 return {get queries(){return queries;},async execute(sql,params){
  queries++;
  for(const expected of [
   "a.tenant_id=m.tenant_id","a.user_id=m.user_id","a.branch_id=?",
   "a.enabled=TRUE","a.role=m.role","u.status='active'",
   "m.tenant_id=?","m.user_id=?","m.role=?","m.status='active'",
   "NOT EXISTS","customer.role='customer'","customer.status='active'"
  ])assert.ok(sql.includes(expected),`missing authorization guard: ${expected}`);
  const [requestedBranch,requestedTenant,requestedUser,requestedRole]=params;
  return [[...(requestedBranch===assignedBranch&&requestedTenant===tenantId&&
   requestedUser===user&&requestedRole===role&&memberActive&&enabled&&userActive&&!customer?
   [{user_id:user}]:[])]];
 }};
}
test("active staff assigned to this branch resolves only with matching role",async()=>{
 const db=mockDB();
 assert.equal(await resolveBoundEmployeeUser(db,tenant,branch,linked),user);
 assert.equal(db.queries,1);
});
test("customer membership or staff/customer dual role is never eligible",async()=>{
 const db=mockDB({customer:true});
 assert.equal(await resolveBoundEmployeeUser(db,tenant,branch,linked),"");
 assert.equal(await resolveBoundEmployeeUser(mockDB(),tenant,branch,{userId:user,role:"customer"}),"");
});
test("wrong branch, wrong tenant, changed role and disabled assignment all fail closed",async()=>{
 assert.equal(await resolveBoundEmployeeUser(mockDB(),tenant,otherBranch,linked),"");
 assert.equal(await resolveBoundEmployeeUser(mockDB({tenantId:otherBranch}),tenant,branch,linked),"");
 assert.equal(await resolveBoundEmployeeUser(mockDB({role:"driver"}),tenant,branch,linked),"");
 assert.equal(await resolveBoundEmployeeUser(mockDB({enabled:false}),tenant,branch,linked),"");
});
test("inactive membership or deleted user may not have password/grants changed",async()=>{
 assert.equal(await resolveBoundEmployeeUser(mockDB({memberActive:false}),tenant,branch,linked),"");
 assert.equal(await resolveBoundEmployeeUser(mockDB({userActive:false}),tenant,branch,linked),"");
});
test("unknown ID or missing branch fails before SQL, supervisor maps to waiter only",async()=>{
 const db=mockDB();
 for(const [t,b,data] of [[tenant,null,linked],[tenant,branch,{userId:"bad",role:"waiter"}],
 [tenant,branch,{userId:user,role:"owner"}],[tenant,branch,{userId:user,role:"manager"}]]){
  assert.equal(await resolveBoundEmployeeUser(db,t,b,data),"");
 }
 assert.equal(db.queries,0);
 assert.equal(employeeMembershipRole("supervisor"),"waiter");
 assert.equal(employeeMembershipRole("driver"),"driver");
 assert.equal(employeeMembershipRole("customer"),null);
});
