import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("floor plan is scoped to branch and tenant and requires authorized writes",()=>{
 const api=read("app/api/restaurant/floor-plan/route.ts");
 assert.match(api,/requireTenantMembership/);
 assert.match(api,/requireAllAdditionalBranchesUnlocked/);
 assert.match(api,/branch_id/);
 assert.match(api,/assertSameOrigin/);
});
test("floor plan is embedded in tables management without replacing reservation engine",()=>{
 const dashboard=read("app/restaurant/merchant-dashboard.tsx");
 assert.match(dashboard,/active==="tables"\?<><RestaurantFloorPlan/);
 assert.match(dashboard,/<ServiceWorkspace key=\{active/);
});
test("floor plan migration and validation bound layout size and entries",()=>{
 const sql=read("migrations/0304_restaurant_floor_plans.sql");
 assert.match(sql,/PRIMARY KEY\(tenant_id,branch_id\)/);
 const validate=read("lib/restaurant/floor-plan.ts");
 assert.match(validate,/p.tables.length>500/);
 assert.match(validate,/ids.has\(t.id\)/);
});

test("floor plan rejects non-finite dimensions, coordinates and duplicate tables",()=>{
 const js=ts.transpileModule(read("lib/restaurant/floor-plan.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exportsObject={};
 new Function("exports",js)(exportsObject);
 const {validFloorPlan}=exportsObject;
 const table={id:"table-1",number:"1",seats:4,x:2,y:3,zone:"Main"};
 const plan={width:24,height:18,tables:[table]};
 assert.equal(validFloorPlan(plan),true);
 for(const bad of [
  {...plan,width:NaN},
  {...plan,height:Infinity},
  {...plan,tables:[{...table,x:NaN}]},
  {...plan,tables:[{...table,y:Infinity}]},
  {...plan,tables:[{...table,x:plan.width}]},
  {...plan,tables:[{...table,y:plan.height}]},
  {...plan,tables:[{...table,number:"   "}]},
  {...plan,tables:[{...table,zone:"   "}]},
  {...plan,tables:[table,{...table,id:"table-2",number:" 1 "}]},
  {...plan,tables:[table,{...table,id:"table-2"}]},
  {...plan,tables:[table,{...table,number:"2"}]},
  {...plan,tables:Array.from({length:501},(_,i)=>({...table,id:"table-"+i,number:String(i)}))}
 ])assert.equal(validFloorPlan(bad),false);
});
test("floor plan PUT limits request bytes before parsing and writing",()=>{
 const api=read("app/api/restaurant/floor-plan/route.ts");
 assert.match(api,/readLimitedJson\(req,131072\)/);
 assert.match(api,/BODY_TOO_LARGE/);
 assert.doesNotMatch(api,/req\.json\(\)/);
});
