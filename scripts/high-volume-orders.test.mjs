import test from "node:test";
import assert from "node:assert/strict";
import {HIGH_VOLUME_PAGE_SIZE,orderTrafficSnapshot,resolveOrdersDisplay,activeKitchenOrders,orderPage} from "../lib/restaurant/high-volume-orders.mjs";
const now=Date.parse("2026-10-25T03:00:00Z");
const row=(i,status="new",offset=10000)=>({id:String(i),status,created_at:new Date(now-offset).toISOString()});
test("auto switches to dense before 50 orders a minute",()=>{
 const orders=Array.from({length:50},(_,i)=>row(i,"new",i*800));
 assert.equal(orderTrafficSnapshot(orders,now).perMinute,50);
 assert.equal(resolveOrdersDisplay("auto",orders,now),"dense");
});
test("manual view overrides pressure without changing order state",()=>{
 const orders=Array.from({length:100},(_,i)=>row(i));
 assert.equal(resolveOrdersDisplay("cards",orders,now),"cards");
 assert.equal(resolveOrdersDisplay("dense",[],now),"dense");
 assert.equal(orders[0].status,"new");
});
test("completed and cancelled leave kitchen active view while ready remains",()=>{
 const orders=[row(1,"new"),row(2,"preparing"),row(3,"ready"),row(4,"completed"),row(5,"cancelled")];
 assert.deepEqual(activeKitchenOrders(orders).map(o=>o.id),["1","2","3"]);
});
test("bounded rendering never drops or changes source orders",()=>{
 const orders=Array.from({length:5000},(_,i)=>row(i));
 assert.equal(orderPage(orders).length,HIGH_VOLUME_PAGE_SIZE);
 assert.equal(orderPage(orders,160).length,160);
 assert.equal(orders.length,5000);
});
test("historic completed orders do not trigger auto dense",()=>{
 const orders=Array.from({length:5000},(_,i)=>row(i,"completed",120000));
 assert.equal(resolveOrdersDisplay("auto",orders,now),"cards");
});
