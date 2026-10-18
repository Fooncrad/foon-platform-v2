import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {runInNewContext} from "node:vm";
const root=dirname(fileURLToPath(import.meta.url));
const [js,html,rust]=await Promise.all([
 readFile(join(root,"ui","demo-orders.js"),"utf8"),
 readFile(join(root,"ui","index.html"),"utf8"),
 readFile(join(root,"src-tauri","src","demo_orders.rs"),"utf8")
]);
const tick=()=>new Promise(r=>setImmediate(r));
function element(id=""){
 return {
   id,textContent:"",disabled:false,hidden:false,children:[],events:{},
   addEventListener(name,fn){this.events[name]=fn},
   append(...nodes){this.children.push(...nodes)},
   replaceChildren(...nodes){this.children=[...nodes]}
 };
}
async function render(enabled){
 const ids=["demo-state","demo-feedback","demo-create","demo-reload","demo-orders"];
 const elements=Object.fromEntries(ids.map(id=>[id,element(id)]));
 const actions=[];
 const data=[{id:"11111111-1111-4111-8111-111111111111",status:"new",pendingEvents:1}];
 const commands={
   demo_status:async()=>({enabled,reason:enabled?"ISOLATED_DEMO_CONFIGURED":"DEMO_DISABLED"}),
   demo_list_orders:async()=>data,
   demo_create_order:async()=>{actions.push("create");return "11111111-1111-4111-8111-111111111111"},
   demo_update_order:async()=>{actions.push("update");return null}
 };
 runInNewContext(js,{
   window:{__TAURI__:{core:{invoke:(name)=>commands[name]()}}},
   document:{getElementById:id=>elements[id],createElement:()=>element()},
   console
 });
 await tick();await tick();
 return {elements,actions};
}
test("W03: native commands require isolated temp database and scope checks",()=>{
 assert(rust.includes('FOON_DESKTOP_DEMO_MODE'));
 assert(rust.includes('FOON-W03-Demo-'));
 assert(rust.includes('canonicalize()'));
 assert(rust.includes('DEMO_SCOPE_FORBIDDEN'));
 assert(rust.includes('FOON_EDGE_CLOUD_SYNC_URL'));
 assert(rust.includes('ctx.branch'));
 assert(rust.includes('DEMO_BRANCH_MISMATCH'));
 assert(rust.includes('DEMO_ORDER_NOT_FOUND'));
 assert(rust.includes('http://127.0.0.1:8787'));
});
test("W03: UI never handles bearer tokens, network fetches, or HTML injections",()=>{
 assert(html.includes('src="./demo-orders.js"'));
 assert(!/FOON_LAN_TOKEN|Bearer |authorization|fetch\s*\(|innerHTML/.test(js));
 for(const cmd of ["demo_status","demo_create_order","demo_list_orders","demo_update_order"])
  assert(js.includes("'"+cmd+"'"));
});
test("W03: production/default mode hides all order controls",async()=>{
 const {elements,actions}=await render(false);
 assert.equal(elements["demo-create"].disabled,true);
 assert.equal(elements["demo-reload"].disabled,true);
 assert.match(elements["demo-state"].textContent,/غير مفعل/);
 assert.equal(actions.length,0);
});
test("W03: opted-in demo shows native orders and enables test controls",async()=>{
 const {elements}=await render(true);
 assert.equal(elements["demo-create"].disabled,false);
 assert.equal(elements["demo-reload"].disabled,false);
 assert.equal(elements["demo-orders"].children.length,1);
 assert.equal(elements["demo-orders"].children[0].children[0].textContent,"طلب #11111111");
 assert.equal(elements["demo-orders"].children[0].children[2].textContent,"أحداث معلقة: 1");
});
test("W03: explicit user clicks trigger order creation or status changes",async()=>{
 const {elements,actions}=await render(true);
 await elements["demo-create"].events.click();
 await tick();await tick();
 assert.deepEqual(actions,["create"]);
 const orderCard=elements["demo-orders"].children[0];
 await orderCard.children.find(item=>item.textContent?.startsWith("انتقال إلى:")).events.click();
 await tick();await tick();
 assert.deepEqual(actions,["create","update"]);
});
