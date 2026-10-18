import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {runInNewContext} from 'node:vm';

const root=dirname(fileURLToPath(import.meta.url));
const js=await readFile(join(root,'ui','station.js'),'utf8');
const html=await readFile(join(root,'ui','index.html'),'utf8');
const rust=await readFile(join(root,'src-tauri','src','lib.rs'),'utf8');

async function render(gateway){
 const elements=new Map();
 const ids=['status-label','status-details','refresh','edge-status-label','edge-status-details','edge-pending','edge-pending-count'];
 for(const id of ids)elements.set(id,{textContent:'',hidden:true,disabled:false,addEventListener(){}});
 const invoke=async name=>name==='station_status'?{localConsoleListener:false}:gateway;
 runInNewContext(js,{document:{getElementById:id=>elements.get(id)},window:{__TAURI__:{core:{invoke}}}});
 await new Promise(resolve=>setImmediate(resolve));
 return elements;
}
test('W02 native health: expected controls exist and renderer has no access to tokens or HTTP',()=>{
 for(const id of ['edge-status-label','edge-status-details','edge-pending','edge-pending-count'])
  assert(html.includes('id="'+id+'"'),id);
 assert(js.includes("invoke('gateway_status')"));
 assert(!/FOON_LAN_TOKEN|Bearer |authorization|fetch\s*\(/.test(js));
 assert(rust.includes('env::var("FOON_LAN_TOKEN")'));
 assert(rust.includes('127.0.0.1:8787/health'));
 assert(rust.includes('StatusCode::UNAUTHORIZED'));
 assert(rust.includes('station_status, gateway_status'));
 assert(rust.includes('format!("Bearer {token}")'));
});
test('W02 native health: authenticated gateway reports pending outbox count',async()=>{
 const e=await render({status:'authenticated',pending:3});
 assert.equal(e.get('edge-pending').hidden,false);
 assert.equal(e.get('edge-pending-count').textContent,'3');
 assert.match(e.get('edge-status-label').textContent,/SQLite/);
 assert.equal(e.get('refresh').disabled,false);
});
test('W02 native health: no credentials fails closed and hides pending count',async()=>{
 const e=await render({status:'not_configured',pending:null});
 assert.equal(e.get('edge-pending').hidden,true);
 assert.match(e.get('edge-status-label').textContent,/غير مهيأ/);
});
test('W02 native health: unauthorized response never represents successful SQLite connection',async()=>{
 const e=await render({status:'unauthorized',pending:99});
 assert.equal(e.get('edge-pending').hidden,true);
 assert.match(e.get('edge-status-label').textContent,/فشل/);
});
test('W02 native health: offline gateway renders unavailable without claiming sync',async()=>{
 const e=await render({status:'not_running',pending:null});
 assert.equal(e.get('edge-pending').hidden,true);
 assert.match(e.get('edge-status-label').textContent,/غير مشغّل/);
});
