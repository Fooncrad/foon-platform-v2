import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {runInNewContext} from "node:vm";
const dir=dirname(fileURLToPath(import.meta.url));
const [ui,html,rust,context,lib]=await Promise.all([
 "ui/durable.js","ui/index.html","src-tauri/src/edge_runtime.rs",
 "src-tauri/src/demo_orders.rs","src-tauri/src/lib.rs"
].map(path=>readFile(join(dir,path),"utf8")));
function button(){return {textContent:"",disabled:false,events:{},
 addEventListener(name,fn){this.events[name]=fn}};}
const tick=()=>new Promise(r=>setImmediate(r));
async function simulate(initial="none"){
 const nodes=Object.fromEntries(["w05-start","w05-stop","w05-status","w05-feedback"]
   .map(x=>[x,button()]));
 let mode=initial;
 const calls=[];
 const invoke=async command=>{
  calls.push(command);
  if(command==="launcher_status")return {running:mode!=="none",mode};
  if(command==="start_durable_test_runtime"){mode="durable";return {running:true,mode};}
  if(command==="stop_durable_test_runtime"){mode="none";return {running:false,mode};}
  throw Error("UNKNOWN_COMMAND");
 };
 runInNewContext(ui,{window:{__TAURI__:{core:{invoke}},
   refreshFoonDemo:async()=>{},refreshFoonStation:async()=>{},refreshFoonLauncher:async()=>{}},
   document:{getElementById:x=>nodes[x],hidden:false}});
 await tick();
 return {nodes,calls};
}
test("W05: no JS token, arbitrary file system path or network access",()=>{
 assert(!/FOON_LAN_TOKEN|FOON_LAN_DB|Bearer |authorization|fetch\s*\(|innerHTML/.test(ui));
 for(const key of ["w05-start","w05-stop","w05-status"]) assert(html.includes('id="'+key+'"'));
 assert(html.includes('src="./durable.js"'));
});
test("W05: start and stop are user actions and display explicit preserved-data language",async()=>{
 const {nodes,calls}=await simulate();
 assert.equal(nodes["w05-start"].disabled,false);
 assert.equal(nodes["w05-stop"].disabled,true);
 await nodes["w05-start"].events.click();
 assert.equal(nodes["w05-start"].disabled,true);
 assert.equal(nodes["w05-stop"].disabled,false);
 await nodes["w05-stop"].events.click();
 assert.equal(nodes["w05-start"].disabled,false);
 assert.equal(nodes["w05-stop"].disabled,true);
 assert.match(nodes["w05-feedback"].textContent,/الاحتفاظ/);
 assert.deepEqual(calls.filter(x=>x.includes("durable_test_runtime")),
   ["start_durable_test_runtime","stop_durable_test_runtime"]);
});
test("W05: existing W04 gateway blocks W05 rather than stopping it",async()=>{
 const {nodes,calls}=await simulate("temporary");
 assert.equal(nodes["w05-start"].disabled,true);
 assert.equal(nodes["w05-stop"].disabled,true);
 assert(!calls.includes("stop_demo_runtime"));
});
test("W05: Rust retention, lock, branch scoping, no network sync",()=>{
 for(const value of ["DURABLE_DB_IN_USE","try_lock_exclusive","w05-durable-test",
  "DURABLE_BRANCH_MISSING_FOR_EXISTING_DB","RuntimeMode::Durable","demo-branch.txt",
  "stop_durable_test_runtime","FOON_EDGE_CLOUD_SYNC_URL","DURABLE_SYMLINK_FORBIDDEN"])
  assert(rust.includes(value),value);
 for(const value of ["DURABLE_BRANCH_MISMATCH","DURABLE_DB_FORBIDDEN","DEMO_SCOPE_FORBIDDEN"])
  assert(context.includes(value),value);
 assert(lib.includes("edge_runtime::start_durable_test_runtime"));
 assert(lib.includes("edge_runtime::stop_durable_test_runtime"));
 assert(rust.includes("if runtime.mode == RuntimeMode::Temporary"));
 assert(!ui.includes("removeItem("));
});
