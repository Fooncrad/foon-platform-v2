import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const routeSource=read("app/api/restaurant/floor-plan/route.ts");
const editorSource=read("app/restaurant/floor-plan-editor.tsx");
const floorSource=read("lib/restaurant/floor-plan.ts");
const js=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const floor={};new Function("exports",js(floorSource))(floor);

async function loadPlan(rows,failDatabase=false){
 const db={execute:async(sql,args)=>{
  if(sql.includes("FROM branches")){assert.match(sql,/tenant_id=\?/);assert.deepEqual(args,["branch-a","tenant-a"]);return [[{id:"branch-a"}]];}
  if(sql.includes("FROM restaurant_floor_plans")){assert.match(sql,/tenant_id=\? AND branch_id=\?/);assert.deepEqual(args,["tenant-a","branch-a"]);if(failDatabase)throw Error("DB unavailable");return [rows];}
  throw Error("Unexpected query: "+sql);
 }};
 const modules={
  "next/server":{NextResponse:{json:(body,init={})=>({body,status:init.status??200,headers:init.headers??{}})}},
  "@/lib/auth/session":{currentUserId:async()=>"user-a"},
  "@/lib/auth/authorization":{requireTenantMembership:async()=>({tenantId:"tenant-a"})},
  "@/lib/restaurant/branch-pin":{requireAllAdditionalBranchesUnlocked:async()=>{}},
  "@/lib/security/origin":{assertSameOrigin:()=>{}},
  "@/lib/db/mysql":{database:()=>db},
  "@/lib/restaurant/floor-plan":floor,
  "@/lib/security/limited-json":{readLimitedJson:async()=>({})}
 };
 const exports={};
 new Function("require","exports",js(routeSource))((name)=>{if(!(name in modules))throw Error("Unexpected import: "+name);return modules[name]},exports);
 return exports.GET(new Request("https://foon.test/api/restaurant/floor-plan?branch=branch-a",{headers:{"x-foon-tenant":"tenant-a"}}));
}
const table={id:"table-1",number:"1",seats:4,x:1,y:1,zone:"Main"};
const valid={width:24,height:18,tables:[table]};

test("new branch with no saved layout receives empty default",async()=>{
 const r=await loadPlan([]);assert.equal(r.status,200);assert.deepEqual(r.body.plan,floor.defaultFloorPlan);
});
test("valid existing branch layout is returned unchanged",async()=>{
 const r=await loadPlan([{layout_json:JSON.stringify(valid)}]);assert.equal(r.status,200);assert.deepEqual(r.body.plan,valid);assert.match(r.headers["Cache-Control"],/no-store/);
});
test("existing invalid layout must never be silently replaced by default",async()=>{
 const r=await loadPlan([{layout_json:JSON.stringify({...valid,tables:[table,{...table,id:"table-2"}]})}]);
 assert.equal(r.status,409);assert.equal(r.body.code,"FLOOR_PLAN_INVALID");assert.equal(r.body.plan,undefined);
});
test("malformed stored JSON fails closed without losing saved tables",async()=>{
 const r=await loadPlan([{layout_json:'{"tables":'}]);assert.equal(r.status,409);assert.equal(r.body.code,"FLOOR_PLAN_INVALID");
});
test("database errors remain service errors, not an empty plan",async()=>{
 const r=await loadPlan([],true);assert.equal(r.status,503);assert.equal(r.body.code,"FLOOR_PLAN_UNAVAILABLE");
});
test("editor cannot save before a successful load or after a failed load",()=>{
 assert.match(editorSource,/const \[loaded,setLoaded\]=useState\(false\)/);
 assert.match(editorSource,/setLoaded\(false\);setPlan\(defaultFloorPlan\)/);
 assert.match(editorSource,/setPlan\(j\.plan\);setLoaded\(true\)/);
 assert.match(editorSource,/catch\(\(\)=>\{if\(active\)\{setLoaded\(false\)/);
 assert.match(editorSource,/async function save\(\)\{if\(!loaded\|\|saving\|\|!branch\)return/);
 assert.match(editorSource,/onClick=\{save\} disabled=\{!loaded\|\|!branch\|\|saving\}/);
});
test("editing and adding tables are also gated while loading",()=>{
 assert.match(editorSource,/function change\([^\n]+\{if\(!loaded\)return/);
 assert.match(editorSource,/onClick=\{add\} disabled=\{!loaded\|\|plan\.tables\.length>=500\}/);
 assert.match(editorSource,/disabled=\{!loaded\} onPointerDown/);
});
