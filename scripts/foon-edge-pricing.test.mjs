import test from "node:test";
import assert from "node:assert/strict";
import {priceEdgeItems} from "../lib/platform/edge-sync-pricing.mjs";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
const item=(id,quantity)=>({id,quantity});
test("authoritative catalog prices and integer cents are used",async()=>{
 const connection={async execute(sql,args){
  if(sql.startsWith("SELECT id FROM branches")){assert.deepEqual(args,["branch-1","tenant-1"]);return [[{id:"branch-1"}]];}
  assert.match(sql,/tenant_id=\?/);assert.match(sql,/FOR UPDATE/);assert.match(sql,/JOIN restaurant_resources/);assert.match(sql,/rr\.archived=0/);assert.match(sql,/rr\.kind=\x27menu_item\x27/);
  assert.deepEqual(args,["tenant-1",a,b]);
  return [[{id:a,name:"Coffee",price:"9.95",currency:"SAR"},{id:b,name:"Tea",price:"4.50",currency:"SAR"}]];
 }};
 const result=await priceEdgeItems(connection,{tenantId:"tenant-1",branchId:"branch-1",items:[item(a,2),item(b,1)]});
 assert.equal(result.subtotalCents,2440);assert.equal(result.currency,"SAR");
});
test("missing or disabled item prevents checkout",async()=>{
 await assert.rejects(()=>priceEdgeItems({execute:async(sql)=>sql.startsWith("SELECT id FROM branches")?[[{id:"b"}]]:[[]]},{tenantId:"t",branchId:"b",items:[item(a,1)]}),/EDGE_CATALOG_ITEM_UNAVAILABLE/);
});
test("duplicate IDs and malformed quantity are rejected before DB",async()=>{
 const connection={execute:async()=>{throw Error("should not query");}};
 await assert.rejects(()=>priceEdgeItems(connection,{tenantId:"t",branchId:"b",items:[item(a,1),item(a,1)]}),/EDGE_INVALID_CART_ITEM/);
 await assert.rejects(()=>priceEdgeItems(connection,{tenantId:"t",branchId:"b",items:[item(a,0)]}),/EDGE_INVALID_CART_ITEM/);
});
test("mixed currencies cannot produce one total",async()=>{
 const connection={execute:async(sql)=>sql.startsWith("SELECT id FROM branches")?[[{id:"b"}]]:[[{id:a,name:"A",price:"1.00",currency:"SAR"},{id:b,name:"B",price:"2.00",currency:"USD"}]]};
 await assert.rejects(()=>priceEdgeItems(connection,{tenantId:"t",branchId:"b",items:[item(a,1),item(b,1)]}),/EDGE_MIXED_CURRENCY/);
});

test("disabled or foreign branch blocks pricing before catalog lookup",async()=>{
 let calls=0;
 const connection={execute:async()=>{calls++;return [[]];}};
 await assert.rejects(()=>priceEdgeItems(connection,{tenantId:"tenant-1",branchId:"branch-foreign",items:[item(a,1)]}),/EDGE_BRANCH_UNAVAILABLE/);
 assert.equal(calls,1);
});
