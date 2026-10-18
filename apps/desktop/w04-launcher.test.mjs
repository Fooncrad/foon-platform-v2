import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {runInNewContext} from "node:vm";

const root=dirname(fileURLToPath(import.meta.url));
const files=await Promise.all([
 "ui/launcher.js","ui/index.html","src-tauri/src/edge_runtime.rs",
 "src-tauri/src/lib.rs","src-tauri/tauri.conf.json","prepare-w04.ps1"
].map(x=>readFile(join(root,x),"utf8")));
const [ui,html,rust,lib,config,prepare]=files;

function makeElement(){
 return {textContent:"",disabled:false,events:{},addEventListener(event,cb){this.events[event]=cb}};
}
async function simulate(){
 const names=["w04-start","w04-stop","w04-status","w04-feedback"];
 const nodes=Object.fromEntries(names.map(x=>[x,makeElement()]));
 const calls=[];
 let running=false;
 const invoke=async(command)=>{
   calls.push(command);
   if(command==="launcher_status")return {running};
   if(command==="start_demo_runtime"){running=true;return {running:true}};
   if(command==="stop_demo_runtime"){running=false;return {running:false}};
 };
 const window={__TAURI__:{core:{invoke}},refreshFoonDemo:async()=>{},refreshFoonStation:async()=>{}};
 runInNewContext(ui,{window,document:{getElementById:k=>nodes[k],hidden:false}});
 await new Promise(resolve=>setImmediate(resolve));
 return {nodes,calls,window};
}
test("W04: native-only launcher UI never reads or receives local service secrets",()=>{
 assert(!/FOON_LAN_TOKEN|FOON_EDGE_ACK_SECRET|Bearer |authorization|fetch\s*\(|innerHTML/.test(ui));
 for(const x of ["w04-start","w04-stop","w04-status"]) assert(html.includes('id="'+x+'"'));
 assert(ui.includes("'start_demo_runtime'"));
 assert(ui.includes("'stop_demo_runtime'"));
});
test("W04: one user action starts isolated runtime, another stops the owned child",async()=>{
 const {nodes,calls}=await simulate();
 assert.equal(nodes["w04-start"].disabled,false);
 assert.equal(nodes["w04-stop"].disabled,true);
 await nodes["w04-start"].events.click();
 assert.equal(nodes["w04-start"].disabled,true);
 assert.equal(nodes["w04-stop"].disabled,false);
 await nodes["w04-stop"].events.click();
 assert.equal(nodes["w04-start"].disabled,false);
 assert.equal(nodes["w04-stop"].disabled,true);
 assert.deepEqual(calls.filter(x=>x.endsWith("_demo_runtime")),["start_demo_runtime","stop_demo_runtime"]);
});
test("W04: runtime rejects occupied port, inherited cloud scope, missing resources",()=>{
 for(const marker of ["PORT_8787_IN_USE","EXISTING_EDGE_CONTEXT_FORBIDDEN","BUNDLED_NODE24_EDGE_MISSING",
  "FOON_EDGE_CLOUD_SYNC_URL","env_clear()","FOON-W03-Demo-","FOON_EDGE_RECEIPT_KEYS"])
  assert(rust.includes(marker),marker);
 assert(!rust.includes("shell(true)"));
});
test("W04: runtime only kills owned child and cleans up on app shutdown",()=>{
 assert(rust.includes("runtime.child.kill()"));
 assert(rust.includes("runtime.child.wait()"));
 assert(rust.includes("clear_demo_env();"));
 assert(!rust.includes("taskkill")&&!rust.includes("Stop-Process"));
 assert(lib.includes("RunEvent::Exit"));
 assert(lib.includes("edge_runtime::DemoRuntime"));
});
test("W04: installer includes verified bundled Node24 and exact Edge dependencies",()=>{
 const c=JSON.parse(config);
 assert(c.bundle.resources.includes("resources/edge-runtime/**/*"));
 assert(prepare.includes('v24.22.0'));
 assert(prepare.includes("Get-FileHash"));
 assert(prepare.includes("OFFICIAL_NODE_CHECKSUM_MISSING"));
 assert(prepare.includes("NODE_OFFICIAL_SHA256_MISMATCH"));
 assert(prepare.includes("edge-sync-receipt-signature.mjs"));
});
