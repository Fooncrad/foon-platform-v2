import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";

export async function runActivityEntitlementGateChecks({db,call,resource,restaurant,staff,fixtures}){
 // Called only by the operations suite after its disposable-DB safety checks.
 const plan="activity-entitlement-guard-plan";
 await db.execute("INSERT INTO package_plans(id,code,name_ar,name_en,name_fr) VALUES (?,?,?,'Activity guard','Activity guard')",[plan,plan,"اختبار قيود النشاط"]);
 await db.execute("INSERT INTO package_plan_features(plan_id,feature_key,enabled,limit_value) SELECT ?,feature_key,enabled,limit_value FROM package_plan_features WHERE plan_id='operations-enterprise'",[plan]);
 const activities=[{activity:"restaurant",owner:restaurant},...fixtures.map(f=>({activity:f.owner.email.slice("catalog-pos-".length).split("@")[0],owner:f.owner}))];
 assert.equal(activities.length,14);
 const sections=new Map();
 for(const {activity,owner} of activities){
  await db.execute("UPDATE tenant_subscriptions SET plan_id=?,starts_at=NULL,ends_at=NULL WHERE tenant_id=?",[plan,owner.tenant]);
  const dining=activity==="restaurant"||activity==="cafe";
  for(const moduleKey of ["sections","tables","reservations","waitlist","waiterCalls","kds"]){
   const r=await resource(owner,moduleKey,undefined,"GET");
   assert.equal(r.status,dining?200:403,activity+":"+moduleKey+":"+JSON.stringify(r.body));
   if(!dining)assert.equal(r.body.code,"ACTIVITY_MODULE_UNAVAILABLE");
  }
  const section=await resource(owner,"sections",{name:"Activity gate section",status:"active",branchId:owner.branch,data:{}});
  assert.equal(section.status,dining?201:403,JSON.stringify(section.body));
  if(dining)sections.set(activity,section.body.id);
  else{
   assert.equal(section.body.code,"ACTIVITY_MODULE_UNAVAILABLE");
   for(const [moduleKey,data,status] of [["tables",{number:1,capacity:2},"available"],["reservations",{partySize:2,scheduledAt:new Date(Date.now()+86400000).toISOString()},"pending"],["waitlist",{partySize:2},"waiting"],["waiterCalls",{tableId:randomUUID()},"pending"]]){
    const denied=await resource(owner,moduleKey,{name:"Blocked dining write",status,branchId:owner.branch,data});
    assert.equal(denied.status,403,JSON.stringify(denied.body));assert.equal(denied.body.code,"ACTIVITY_MODULE_UNAVAILABLE");
   }
  }
  const assigned=await call("/api/restaurant/assigned-service?tenantId="+owner.tenant,"GET",undefined,owner.cookie);
  assert.equal(assigned.status,dining?200:403,JSON.stringify(assigned.body));
  if(!dining)assert.equal(assigned.body.code,"ACTIVITY_MODULE_UNAVAILABLE");
  assert.equal((await resource(owner,"pos",undefined,"GET")).status,200,activity+" shared POS stays allowed by its explicit grant");
 }
 const grocery=activities.find(a=>a.activity==="grocery").owner,cafe=activities.find(a=>a.activity==="cafe").owner;
 const legacySection=randomUUID();
 await db.execute("INSERT INTO restaurant_resources(id,tenant_id,branch_id,kind,name,status,data) VALUES (?,?,?,'dining_section','Historical section','active','{}')",[legacySection,grocery.tenant,grocery.branch]);
 const patch={id:legacySection,version:1,name:"Changed historical section",status:"active",branchId:grocery.branch,data:{}};
 for(const method of ["PATCH","DELETE"]){const r=await resource(grocery,"sections",patch,method);assert.equal(r.status,403);assert.equal(r.body.code,"ACTIVITY_MODULE_UNAVAILABLE");}
 const [[unchanged]]=await db.execute("SELECT name,version,archived FROM restaurant_resources WHERE id=?",[legacySection]);
 assert.equal(unchanged.name,"Historical section");assert.equal(Number(unchanged.version),1);assert.equal(Number(unchanged.archived),0);

 // Even a valid employee grant and assigned branch cannot reopen another activity's KDS.
 await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,'cashier','active')",[randomUUID(),grocery.tenant,staff.user]);
 await db.execute("INSERT INTO employee_branch_assignments(id,tenant_id,user_id,branch_id,role,enabled) VALUES (?,?,?,?,'cashier',TRUE)",[randomUUID(),grocery.tenant,staff.user,grocery.branch]);
 for(const key of ["kitchen.view","pos.view","pos.manage"])await db.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,?,TRUE)",[randomUUID(),grocery.tenant,staff.user,grocery.branch,key]);
 const employee={...grocery,cookie:staff.cookie};
 const blockedKitchen=await resource(employee,"kds",undefined,"GET");assert.equal(blockedKitchen.status,403);assert.equal(blockedKitchen.body.code,"ACTIVITY_MODULE_UNAVAILABLE");
 assert.equal((await resource(employee,"pos",undefined,"GET")).status,200);
 assert.equal((await call("/api/restaurant/operations/pos?branch="+restaurant.branch,"GET",undefined,staff.cookie,grocery.tenant)).status,403);
 assert.equal((await call("/api/restaurant/operations/pos","GET",undefined,cafe.cookie,grocery.tenant)).status,403);
 await db.execute("UPDATE employee_permission_grants SET allowed=FALSE WHERE tenant_id=? AND user_id=? AND permission_key='pos.view'",[grocery.tenant,staff.user]);
 assert.equal((await resource(employee,"pos",undefined,"GET")).body.code,"FORBIDDEN","explicit denial beats manage grant");
 const noOrigin=await fetch("http://localhost:3103/api/restaurant/assigned-service",{method:"POST",headers:{cookie:staff.cookie,"content-type":"application/json"},body:JSON.stringify({tenantId:grocery.tenant,callId:randomUUID(),action:"accept"})});
 assert.equal(noOrigin.status,403);

 // Plan checks and quotas remain additional restrictions on supported dining tools.
 const tableBody={name:"Gate table",status:"available",branchId:cafe.branch,data:{sectionId:sections.get("cafe"),number:1,capacity:2}};
 await db.execute("UPDATE package_plan_features SET limit_value=0 WHERE plan_id=? AND feature_key='tables'",[plan]);
 assert.equal((await resource(cafe,"tables",tableBody)).body.code,"PLAN_LIMIT_REACHED");
 await db.execute("UPDATE package_plan_features SET limit_value=1 WHERE plan_id=? AND feature_key='tables'",[plan]);
 assert.equal((await resource(cafe,"tables",tableBody)).status,201);
 assert.equal((await resource(cafe,"tables",{...tableBody,name:"Second gate table",data:{...tableBody.data,number:2}})).body.code,"PLAN_LIMIT_REACHED");
 await db.execute("UPDATE package_plan_features SET enabled=FALSE WHERE plan_id=? AND feature_key='tables'",[plan]);
 assert.equal((await resource(cafe,"tables",undefined,"GET")).body.code,"PLAN_FEATURE_REQUIRED");
 assert.equal((await call("/api/restaurant/assigned-service?tenantId="+cafe.tenant,"GET",undefined,cafe.cookie)).body.code,"PLAN_FEATURE_REQUIRED");
 await db.execute("DELETE FROM package_plan_features WHERE plan_id=? AND feature_key='tables'",[plan]);
 assert.equal((await resource(cafe,"tables",undefined,"GET")).body.code,"PLAN_FEATURE_REQUIRED");
 await db.execute("INSERT INTO package_plan_features(plan_id,feature_key,enabled,limit_value) VALUES (?,'tables',TRUE,NULL)",[plan]);
 await db.execute("UPDATE tenant_subscriptions SET ends_at=UTC_TIMESTAMP()-INTERVAL 1 DAY WHERE tenant_id=?",[cafe.tenant]);
 assert.equal((await resource(cafe,"kds",undefined,"GET")).body.code,"PLAN_FEATURE_REQUIRED");
 await db.execute("UPDATE tenant_subscriptions SET ends_at=NULL,starts_at=UTC_TIMESTAMP()+INTERVAL 1 DAY WHERE tenant_id=?",[cafe.tenant]);
 assert.equal((await resource(cafe,"tables",undefined,"GET")).body.code,"PLAN_FEATURE_REQUIRED");
 await db.execute("UPDATE tenant_subscriptions SET starts_at=NULL WHERE tenant_id=?",[cafe.tenant]);
 assert.equal((await resource(cafe,"tables",undefined,"GET")).status,200);

 // Compatibility is deliberate: unknown/missing old profiles retain the old grant policy.
 await db.execute("UPDATE tenant_business_profiles SET activity_code='legacy-unknown' WHERE tenant_id=?",[cafe.tenant]);
 assert.equal((await resource(cafe,"tables",undefined,"GET")).status,200);
 await db.execute("DELETE FROM tenant_business_profiles WHERE tenant_id=?",[cafe.tenant]);
 assert.equal((await resource(cafe,"tables",undefined,"GET")).status,200);
 console.info("Server activity gates: 14 activities, owner/employee/branch isolation, read/write denial, zero limits, disabled/missing grants and subscription dates verified");
}
