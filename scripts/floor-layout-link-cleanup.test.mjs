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
 const loadedModule={exports:{}};
 new Function("require","module","exports",js)(name=>{
  if(Object.hasOwn(deps,name))return deps[name];
  throw Error("Unexpected dependency: "+name);
 },loadedModule,loadedModule.exports);
 return loadedModule.exports;
}
const {readLimitedJson}=compile("lib/security/limited-json.ts");
const id="12345678-1234-1234-1234-123456789abc";
const otherSection="87654321-4321-4321-4321-cba987654321";
function setup(previousSection=id,failDelete=false){
 const calls={begun:0,committed:0,rolledBack:0,released:0,deletes:[],updates:0};
 const connection={
  beginTransaction:async()=>{calls.begun++},
  commit:async()=>{calls.committed++},
  rollback:async()=>{calls.rolledBack++},
  release:()=>{calls.released++},
  execute:async(sql,params)=>{
   if(sql.includes("SELECT section_id FROM restaurant_floor_plan_layouts"))return [[{section_id:previousSection}]];
   if(sql.startsWith("UPDATE restaurant_floor_plan_layouts")){calls.updates++;return [{affectedRows:1}]}
   if(sql.startsWith("DELETE FROM restaurant_floor_table_")){
    calls.deletes.push({sql,params});
    if(failDelete)throw Error("simulated database failure");
    return [{affectedRows:1}];
   }
   throw Error("Unexpected SQL: "+sql);
  }
 };
 const deps={
  "node:crypto":{randomUUID:()=>id},
  "next/server":{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  "@/lib/db/mysql":{database:()=>({
   execute:async(sql)=>{
    if(sql.includes("FROM branches")||sql.includes("kind='dining_section'"))return [[{id}]];
    throw Error("Unexpected scope query: "+sql);
   },
   getConnection:async()=>connection
  })},
  "@/lib/auth/session":{currentUserId:async()=> "owner-1"},
  "@/lib/auth/authorization":{requireTenantMembership:async()=>({tenantId:"tenant-1"})},
  "@/lib/restaurant/branch-pin":{requireAllAdditionalBranchesUnlocked:async()=>{}},
  "@/lib/security/origin":{assertSameOrigin:()=>{}},
  "@/lib/security/limited-json":{readLimitedJson},
  "@/lib/restaurant/floor-plan":{validFloorPlan:()=>true}
 };
 return {PUT:compile("app/api/restaurant/floor-plan-layouts/route.ts",deps).PUT,calls};
}
function request(sectionId,tableIds){
 return new Request("https://foon.example/api/restaurant/floor-plan-layouts?branch=branch-1",{
  method:"PUT",headers:{"x-foon-tenant":"tenant-1","content-type":"application/json"},
  body:JSON.stringify({id,sectionId,name:"Main hall",plan:{width:10,height:10,tables:tableIds.map(tableId=>({id:tableId}))}})
 });
}
test("saving a layout prunes removed table links and statuses in one transaction",async()=>{
 const {PUT,calls}=setup();
 const response=await PUT(request(id,["table-1","table-2"]));
 assert.equal(response.status,200);
 assert.equal(calls.updates,1);
 assert.equal(calls.begun,1);
 assert.equal(calls.committed,1);
 assert.equal(calls.rolledBack,0);
 assert.equal(calls.released,1);
 assert.equal(calls.deletes.length,2);
 for(const {sql,params} of calls.deletes){
  assert.match(sql,/floor_table_id NOT IN \(\?,\?\)/);
  assert.deepEqual(params,["tenant-1","branch-1",id,"table-1","table-2"]);
 }
});
test("moving a layout to a different section clears incompatible real table links",async()=>{
 const {PUT,calls}=setup(otherSection);
 const response=await PUT(request(id,["table-1"]));
 assert.equal(response.status,200);
 assert.equal(calls.deletes.length,2);
 for(const {sql,params} of calls.deletes){
  assert.doesNotMatch(sql,/NOT IN/);
  assert.deepEqual(params,["tenant-1","branch-1",id]);
 }
});
test("failed stale-link cleanup rolls back the layout edit",async()=>{
 const {PUT,calls}=setup(id,true);
 const response=await PUT(request(id,["table-1"]));
 assert.equal(response.status,503);
 assert.equal(calls.committed,0);
 assert.equal(calls.rolledBack,1);
 assert.equal(calls.released,1);
});
