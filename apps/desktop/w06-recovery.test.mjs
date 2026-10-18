import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
const root=dirname(fileURLToPath(import.meta.url));
const [ui,html,backend,inspector,preparer,lib]=await Promise.all([
 'ui/recovery.js','ui/index.html','src-tauri/src/edge_runtime.rs',
 'w06-inspect-sqlite.mjs','prepare-w06.ps1','src-tauri/src/lib.rs'
].map(file=>readFile(join(root,file),'utf8')));
const button=()=>({disabled:false,textContent:'',events:{},addEventListener(k,v){this.events[k]=v}});
async function screen(report,error=false){
 const elements=Object.fromEntries(['w06-inspect','w06-status','w06-feedback'].map(k=>[k,button()]));
 const calls=[];
 const invoke=async command=>{
  calls.push(command);if(error)throw Error('FAIL');return report;
 };
 runInNewContext(ui,{window:{__TAURI__:{core:{invoke}}},
  document:{getElementById:k=>elements[k]}});
 await elements['w06-inspect'].events.click();
 return {elements,calls};
}
test('W06 recovery inspector is native-only, opt-in and exposes counts without secrets',async()=>{
 assert(html.includes('src="./recovery.js"'));
 for(const id of ['w06-inspect','w06-status','w06-feedback'])assert(html.includes('id="'+id+'"'));
 assert(!/FOON_LAN_TOKEN|FOON_LAN_DB|Bearer |fetch\s*\(|innerHTML|localStorage/.test(ui));
 const {elements,calls}=await screen({healthy:true,orders:25,events:100,pending:100});
 assert.deepEqual(calls,['inspect_durable_sqlite']);
 assert.match(elements['w06-feedback'].textContent,/100/);
 assert.equal(elements['w06-inspect'].disabled,false);
});
test('W06 failure does not report healthy SQLite or leak an error detail',async()=>{
 const {elements}=await screen(null,true);
 assert.match(elements['w06-status'].textContent,/تعذر/);
 assert(!elements['w06-feedback'].textContent.includes('localhost'));
});
test('W06 diagnostic runs read-only, refuses concurrent gateway and uses bundled runtime',()=>{
 for(const m of ['W06_SQLITE_INTEGRITY_FAILED','STOP_GATEWAY_BEFORE_DISK_CHECK',
  'PORT_8787_IN_USE','try_lock_exclusive','W05_BRANCH_MANIFEST_INVALID',
  'w06-inspect-sqlite.mjs','env_clear()'])assert(backend.includes(m),m);
 assert(inspector.includes('readOnly:true'));
 assert(inspector.includes('PRAGMA integrity_check'));
 assert(inspector.includes('PRAGMA query_only=ON'));
 assert(!/INSERT INTO|UPDATE orders|DELETE FROM|DROP TABLE|VACUUM/.test(inspector));
 assert(lib.includes('edge_runtime::inspect_durable_sqlite'));
 assert(preparer.includes('prepare-w04.ps1'));
 assert(preparer.includes('w06-inspect-sqlite.mjs'));
});
