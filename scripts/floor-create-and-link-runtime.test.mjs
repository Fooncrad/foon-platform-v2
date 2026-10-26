import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
function compile(path,deps={}){
 const source=readFileSync(resolve(root,path),"utf8");
 const js=ts.transpileModule(source,{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function("require","module","exports",js)(name=>{
  if(Object.hasOwn(deps,name))return deps[name];
  throw Error("Unexpected dependency: "+name);
 },mod,mod.exports);
 return mod.exports;
}
const {readLimitedJson}=compile("lib/security/limited-json.ts");
const {validFloorPlan}=compile("lib/restaurant/floor-plan.ts");
const layoutId="12345678-1234-1234-1234-123456789abc";
const sectionId="87654321-4321-4321-4321-cba987654321";
const realTableId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
function setup({number="1",existing=false,linked=false}={}){
 const calls={saves:[],links:0,commits:0,rollbacks:0,lockOrder:[]};
 const plan={width:24,height:18,tables:[{id:"drawn-1",number,seats:4,x:2,y:2,zone:"inside"}]};
 const connection={
  beginTransaction:async()=>{},
  commit:async()=>{calls.commits++},
  rollback:async()=>{calls.rollbacks++},
  release:()=>{},
  execute:async(sql)=>{
   if(sql.startsWith("SELECT layout_json FROM restaurant_floor_plan_layouts")){calls.lockOrder.push("layout");return [[{layout_json:JSON.stringify(plan)}]];}
   if(sql.startsWith("SELECT p.section_id FROM restaurant_floor_plan_layouts"))return [[{section_id:sectionId}]];
   if(sql.startsWith("SELECT dining_table_id FROM restaurant_floor_table_links"))return [linked?[{dining_table_id:realTableId}]:[]];
   if(sql.startsWith("SELECT id FROM branches WHERE tenant_id=? AND id=? FOR UPDATE")){calls.lockOrder.push("branch");return [[{id:"branch-1"}]];}
   if(sql.startsWith("SELECT id FROM restaurant_resources WHERE tenant_id=? AND kind='dining_table'"))return [existing?[{id:realTableId}]:[]];
   if(sql.startsWith("INSERT INTO restaurant_floor_table_links")){calls.links++;return [{affectedRows:1}]}
   throw Error("Unexpected SQL: "+sql);
  }
 };
 const deps={
  "node:crypto":{randomUUID:()=>realTableId},
  "next/server":{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  "@/lib/db/mysql":{database:()=>({
   execute:async(sql)=>{
    if(sql.startsWith("SELECT id FROM branches WHERE id=? AND tenant_id=?"))return [[{id:"branch-1"}]];
    throw Error("Unexpected scope SQL: "+sql);
   },
   getConnection:async()=>connection
  })},
  "@/lib/auth/session":{currentUserId:async()=> "owner-1"},
  "@/lib/auth/authorization":{requireTenantMembership:async()=>({tenantId:"tenant-1"})},
  "@/lib/restaurant/branch-pin":{requireAllAdditionalBranchesUnlocked:async()=>{}},
  "@/lib/security/origin":{assertSameOrigin:()=>{}},
  "@/lib/security/limited-json":{readLimitedJson},
  "@/lib/restaurant/floor-plan":{validFloorPlan},
  "@/lib/restaurant/operations":{saveResource:async(_db,_tenant,_actor,_role,module,body)=>{
   calls.saves.push({module,body});return {id:realTableId};
  }}
 };
 return {PATCH:compile("app/api/restaurant/floor-plan-layouts/route.ts",deps).PATCH,calls};
}
function request(){
 return new Request("https://foon.example/api/restaurant/floor-plan-layouts?branch=branch-1",{
  method:"PATCH",headers:{"x-foon-tenant":"tenant-1","content-type":"application/json"},
  body:JSON.stringify({id:layoutId,action:"createAndLink",tableId:"drawn-1"})
 });
}
test("numeric drawn table creates exactly one real table and link atomically",async()=>{
 const {PATCH,calls}=setup();
 const response=await PATCH(request()),body=await response.json();
 assert.equal(response.status,201);
 assert.equal(body.diningTableId,realTableId);
 assert.equal(calls.saves.length,1);
 assert.equal(calls.saves[0].module,"tables");
 assert.equal(calls.saves[0].body.data.number,1);
 assert.equal(calls.saves[0].body.data.capacity,4);
 assert.equal(calls.saves[0].body.data.sectionId,sectionId);
 assert.equal(calls.links,1);assert.equal(calls.commits,1);assert.equal(calls.rollbacks,0);
 assert.deepEqual(calls.lockOrder,["branch","layout"],"branch lock must precede layout lock to match PUT and avoid deadlocks");
});
test("nondecimal drawn table number cannot create a registered table",async()=>{
 const {PATCH,calls}=setup({number:"1A"});
 const response=await PATCH(request());
 assert.equal(response.status,400);
 assert.equal((await response.json()).code,"REGISTERED_TABLE_NUMBER_INVALID");
 assert.equal(calls.saves.length,0);assert.equal(calls.links,0);assert.equal(calls.rollbacks,1);
});
test("existing registered number fails safely without creating duplicates",async()=>{
 const {PATCH,calls}=setup({existing:true});
 const response=await PATCH(request());
 assert.equal(response.status,409);
 assert.equal((await response.json()).code,"REGISTERED_TABLE_NUMBER_EXISTS");
 assert.equal(calls.saves.length,0);assert.equal(calls.links,0);
 assert.deepEqual(calls.lockOrder,["branch","layout"]);
});
test("already-linked drawn table is idempotent",async()=>{
 const {PATCH,calls}=setup({linked:true});
 const response=await PATCH(request());
 assert.equal(response.status,200);
 assert.equal((await response.json()).alreadyLinked,true);
 assert.equal(calls.saves.length,0);assert.equal(calls.links,0);
});
