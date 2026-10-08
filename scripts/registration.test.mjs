import test from "node:test";
import assert from "node:assert/strict";
import {validStoreSlug} from "./store-slug.mjs";
import {provisionStore} from "./provision-store.mjs";
import {registerCustomer} from "./register-customer.mjs";

test("reserved routes cannot be store addresses; supported long addresses remain reachable",()=>{
 for(const slug of ["admin","customer","restaurant","register","a","-store","store-","Upper"])assert.equal(validStoreSlug(slug),false,slug);
 assert.equal(validStoreSlug("a".repeat(120)),true);
 assert.equal(validStoreSlug("a".repeat(121)),false);
});
test("missing or disabled default plan fails before any store writes",async()=>{
 const calls=[];
 await assert.rejects(provisionStore({execute:async(sql)=>{calls.push(sql);return [[]];}},{ownerId:"owner",name:"Store",slug:"my-store"}),/FREE_PLAN_UNAVAILABLE/);
 assert.equal(calls.length,1);assert.match(calls[0],/enabled=TRUE/);
});
test("customer registration binds only the selected active store and never creates operational access",async()=>{
 const calls=[];
 const db={execute:async(sql,params)=>{calls.push({sql,params});return sql.startsWith("SELECT")?[[{id:"source-store"}]]:[{}];}};
 const result=await registerCustomer(db,{id:"customer",email:"c@test.example",passwordHash:"hash",name:"Client",storeSlug:"source-store"});
 assert.equal(result.tenantId,"source-store");assert.equal(calls.length,3);
 assert.match(calls[0].sql,/status='active'/);
 assert.deepEqual(calls[2].params,["source-store","customer"]);
 assert.ok(calls.every(c=>!c.sql.includes("memberships")&&!c.sql.includes("tenant_subscriptions")));
});
test("unavailable source store cannot leave a new customer account",async()=>{
 let count=0;
 await assert.rejects(registerCustomer({execute:async()=>{count++;return [[]];}},{id:"customer",email:"c@test.example",passwordHash:"hash",name:"Client",storeSlug:"missing-store"}),/STORE_NOT_FOUND/);
 assert.equal(count,1);
});
