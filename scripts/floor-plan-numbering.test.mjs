import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

const source=readFileSync(new URL("../lib/restaurant/floor-plan.ts",import.meta.url),"utf8");
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const lib={};
new Function("exports",javascript)(lib);
const table=(number,id=number)=>({id:"table-"+id,number,seats:4,x:1,y:1,zone:"Main"});
const plan=tables=>({width:24,height:18,tables});

test("empty floor plan starts at table 1",()=>assert.equal(lib.nextFloorTableNumber([]),"1"));
test("sequential tables get next available number",()=>assert.equal(lib.nextFloorTableNumber([table("1"),table("2")]),"3"));
test("deleting middle table never duplicates a remaining number",()=>assert.equal(lib.nextFloorTableNumber([table("1"),table("3")]),"2"));
test("deleting first table allows reuse without collision",()=>assert.equal(lib.nextFloorTableNumber([table("2"),table("3")]),"1"));
test("numbering respects trimmed existing numbers",()=>assert.equal(lib.nextFloorTableNumber([table(" 1 "),table("2")]),"3"));
test("custom table labels remain untouched",()=>assert.equal(lib.nextFloorTableNumber([table("VIP"),table("1")]),"2"));
test("generated number produces a valid floor plan",()=>{
 const tables=[table("1"),table("3")];
 assert.equal(lib.validFloorPlan(plan([...tables,table(lib.nextFloorTableNumber(tables))])),true);
});
test("validator rejects duplicate numbers including whitespace variants",()=>assert.equal(lib.validFloorPlan(plan([table("1"),table(" 1 ","second")])),false));
test("validator rejects empty table number",()=>assert.equal(lib.validFloorPlan(plan([table(" ")])),false));
test("validator rejects duplicate table IDs",()=>assert.equal(lib.validFloorPlan(plan([table("1"),table("2","1")])),false));
