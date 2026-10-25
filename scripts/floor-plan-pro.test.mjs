
import ts from "typescript";
import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");test("FOON floor workspace uses responsive full width rather than constrained legacy drawing",()=>{const x=read("app/restaurant/floor-plan-editor.css");assert.match(x,/grid-template-columns:minmax\(0,1fr\)/);assert.match(x,/min-width:0/);assert.doesNotMatch(read("app/restaurant/floor-plan-editor.tsx"),/maxWidth:900/)});test("visual drag, keyboard, zoom and existing reservation navigation",()=>{const x=read("app/restaurant/floor-plan-editor.tsx");for(const k of ["onPointerMove","onPointerUp","onKeyDown","setZoom","onReservations","onClick={save}","x-foon-tenant"])assert.ok(x.includes(k),k);const dashboard=read("app/restaurant/merchant-dashboard.tsx");assert.match(dashboard,/onReservations=\{\(\)=>navigate\("reservations"\)\}/)});test("does not forge availability or overwrite booking operations",()=>{const x=read("app/restaurant/floor-plan-editor.tsx");assert.match(x,/الحجوزات الفعلية/);assert.doesNotMatch(x,/\/api\/restaurant\/operations\/reservations/);assert.match(x,/floor-plan\?branch=/)});
test("drag and keyboard never place tables on the invalid outer boundary",()=>{
 const source=read("lib/restaurant/floor-plan.ts");
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exportsObject={};new Function("exports",js)(exportsObject);
 const {clampFloorCoordinate,validFloorPlan}=exportsObject;
 const base={width:2,height:3,tables:[{id:"table-1",number:"1",seats:4,x:1,y:2,zone:"Main"}]};
 for(const [input,dimension] of [[2,2],[999,2],[3,3],[Infinity,3],[-1,2]]){
  const coordinate=clampFloorCoordinate(input,dimension);
  assert.ok(coordinate>=0&&coordinate<dimension,`out of bounds: ${input} / ${dimension}`);
 }
 assert.equal(validFloorPlan({...base,tables:[{...base.tables[0],x:clampFloorCoordinate(2,2),y:clampFloorCoordinate(3,3)}]}),true);
 const editor=read("app/restaurant/floor-plan-editor.tsx");
 assert.match(editor,/const x=clampFloorCoordinate\(/);
 assert.match(editor,/const y=clampFloorCoordinate\(/);
 assert.match(editor,/x:clampFloorCoordinate\(x\.x\+dx,p\.width\)/);
 assert.match(editor,/y:clampFloorCoordinate\(x\.y\+dy,p\.height\)/);
});
