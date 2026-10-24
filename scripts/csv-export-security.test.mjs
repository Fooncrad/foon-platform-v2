import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {quoteCsvCell} from "../lib/security/csv-export.ts";

test("neutralizes spreadsheet formula prefixes in product and option names",()=>{
 for(const value of ["=1+1","+SUM(1,2)",'-HYPERLINK("https://example.org")',"@SUM(1,2)","  =1+1","\t=1+1","\uFEFF=1+1","\u200B=1+1"]){
  assert.equal(quoteCsvCell(value),'"\''+value.replaceAll('"','""')+'"');
 }
});
test("preserves normal numeric prices, quoted CSV and multilingual names",()=>{
 for(const value of ["-2.50","+12","0","2.5","اسم,إضافة","Supplément","قهوة"]){
  assert.equal(quoteCsvCell(value),'"'+value.replaceAll('"','""')+'"');
 }
 assert.equal(quoteCsvCell(null),'""');
 assert.equal(quoteCsvCell('"=1+1"'),'"""=1+1"""');
});
test("neutralizes formulas after multiline whitespace",()=>{
 assert.equal(quoteCsvCell("\r\n=1+1"),'"\'\r\n=1+1"');
});
test("both restaurant and multi-activity exports use safe CSV cell escaping",()=>{
 for(const file of ["app/restaurant/menu/addons-panel.tsx","app/restaurant/catalog-options.tsx"]){
  const src=readFileSync(new URL("../"+file,import.meta.url),"utf8");
  assert.match(src,/import \{quoteCsvCell\} from "@\/lib\/security\/csv-export"/);
  assert.match(src,/\.map\(quoteCsvCell\)/);
  assert.doesNotMatch(src,/const quote=\(/);
 }
});
