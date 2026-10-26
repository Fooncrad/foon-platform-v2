import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const ts=require('typescript');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
class ResourceError extends Error{constructor(code){super(code);this.code=code;}}
const source=readFileSync(resolve(root,'lib/restaurant/dining.ts'),'utf8');
const js=ts.transpileModule(source,{fileName:'dining.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
new Function('require','module','exports',js)(id=>id==='@/scripts/restaurant-resource-schema.mjs'?{ResourceError}:require(id),module,module.exports);
const {prepareDiningResource}=module.exports;

function fixture({status='occupied',capacity=4,tenant='tenant-A',branch='branch-A'}={}){
 const calls=[];
 const db={execute:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.includes("kind='dining_table'")&&sql.includes('SELECT id FROM restaurant_resources')){
   return [[...(params[0]===tenant&&params[2]===branch?[{id:'table-1'}]:[])]];
  }
  if(sql.includes("kind='dining_table'")&&sql.includes('SELECT id,name,branch_id,data')){
   const available=status==='available'||sql.includes("status<>'inactive'")&&status!=='inactive';
   return [available&&params[0]===tenant?[{id:'table-1',name:'Table 1',branch_id:branch,data:JSON.stringify({capacity})}]:[]];
  }
  if(sql.includes('FROM restaurant_orders')||sql.includes("kind='reservation'"))return [[]];
  throw new Error('Unexpected query: '+sql);
 }};
 return {db,calls};
}
function reservation(status){return {name:'Guest booking',status,branchId:'branch-A',data:{tableId:'table-1',sectionId:null,partySize:4,scheduledAt:'2026-10-26T13:00:00Z',durationMinutes:90}};}

test('terminal reservation updates may finish on an occupied table',async()=>{
 for(const status of ['completed','cancelled','no_show']){
  const {db,calls}=fixture();
  const input=reservation(status);
  await prepareDiningResource(db,'tenant-A','reservations',input,'reservation-1');
  assert.equal(input.data.tableId,'table-1');
  assert.ok(calls.some(call=>call.sql.includes("status<>'inactive'")&&call.sql.includes('FOR UPDATE')),status);
 }
});
test('terminal updates do not revalidate capacity after a table is resized',async()=>{
 const {db}=fixture({capacity:2});
 await prepareDiningResource(db,'tenant-A','reservations',reservation('cancelled'),'reservation-1');
});
test('pending and confirmed reservations still require an available table',async()=>{
 for(const status of ['pending','confirmed','seated']){
  const {db}=fixture();
  await assert.rejects(()=>prepareDiningResource(db,'tenant-A','reservations',reservation(status),'reservation-1'),error=>error.code==='TABLE_NOT_FOUND');
 }
});
test('new active reservations still enforce table capacity',async()=>{
 const {db}=fixture({status:'available',capacity:2});
 await assert.rejects(()=>prepareDiningResource(db,'tenant-A','reservations',reservation('confirmed'),'reservation-1'),error=>error.code==='TABLE_CAPACITY_EXCEEDED');
});
test('an available same-tenant and same-branch table remains bookable',async()=>{
 const {db}=fixture({status:'available'});
 const input=reservation('confirmed');
 await prepareDiningResource(db,'tenant-A','reservations',input,'reservation-1');
 assert.equal(input.data.tableId,'table-1');
});
test('cross-tenant or cross-branch table references are never retained',async()=>{
 for(const options of [{tenant:'tenant-B'},{branch:'branch-B'}]){
  const {db}=fixture(options);
  const input=reservation('cancelled');
  await prepareDiningResource(db,'tenant-A','reservations',input,'reservation-1');
  assert.equal(input.data.tableId,null);
 }
});
