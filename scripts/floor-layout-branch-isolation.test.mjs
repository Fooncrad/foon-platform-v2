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
const path="app/api/restaurant/floor-plan-layouts/route.ts";
function handler(){
 const calls={scope:0,writes:0,transactions:0};
 const deps={
  "node:crypto":{randomUUID:()=> "12345678-1234-1234-1234-123456789abc"},
  "next/server":{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  "@/lib/db/mysql":{database:()=>({
   execute:async(sql)=>{if(sql.includes("FROM branches")){calls.scope++;return [[{id:"branch-1"}]];}calls.writes++;return [[]];},
   getConnection:async()=>{calls.transactions++;throw Error("must not begin transaction for invalid body");}
  })},
  "@/lib/auth/session":{currentUserId:async()=> "owner-1"},
  "@/lib/auth/authorization":{requireTenantMembership:async()=>({tenantId:"tenant-1"})},
  "@/lib/restaurant/branch-pin":{requireAllAdditionalBranchesUnlocked:async()=>{}},
  "@/lib/security/origin":{assertSameOrigin:()=>{}},
  "@/lib/security/limited-json":{readLimitedJson},
  "@/lib/restaurant/floor-plan":{validFloorPlan:()=>true}
 };
 return {PATCH:compile(path,deps).PATCH,calls};
}
function request(body){
 return new Request("https://foon.example/api/restaurant/floor-plan-layouts?branch=branch-1",{
  method:"PATCH",headers:{"x-foon-tenant":"tenant-1","content-type":"application/json"},body
 });
}
test("oversized floor table operation is rejected with 413 before any write",async()=>{
 const {PATCH,calls}=handler();
 const response=await PATCH(request(JSON.stringify({id:"12345678-1234-1234-1234-123456789abc",action:"activate",active:true,padding:"x".repeat(4100)})));
 assert.equal(response.status,413);
 assert.equal((await response.json()).code,"BODY_TOO_LARGE");
 assert.equal(calls.scope,1);
 assert.equal(calls.writes,0);
 assert.equal(calls.transactions,0);
});
test("malformed floor table operation remains HTTP 400",async()=>{
 const {PATCH,calls}=handler();
 const response=await PATCH(request("{broken"));
 assert.equal(response.status,400);
 assert.equal((await response.json()).code,"INVALID_INPUT");
 assert.equal(calls.writes,0);
 assert.equal(calls.transactions,0);
});
test("section editor remounts when tenant or branch changes",()=>{
 const ui=readFileSync(resolve(root,"app/restaurant/section-floor-layouts.tsx"),"utf8");
 assert.ok(ui.includes('SectionFloorLayoutsScoped key={props.tenantId+":"+props.branch}'));
 assert.ok(ui.includes('function SectionFloorLayoutsScoped('));
});
