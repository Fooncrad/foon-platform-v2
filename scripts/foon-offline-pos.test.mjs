import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
import "fake-indexeddb/auto";
const source=stripTypeScriptTypes(await readFile(new URL("../lib/restaurant/offline-pos.ts",import.meta.url),"utf8"),{mode:"strip"})+"\n//# sourceURL=offline-pos-runtime.mjs";
const {queuePosOrder,pendingPosOrders,scopedPosOrders,exportPendingPosOrders,importPendingPosOrders,retryReviewedPosOrder,offlineTableBlock}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const id1="11111111-1111-4111-8111-111111111111",id2="22222222-2222-4222-8222-222222222222";
const order=(id,quantity=1,branchId="branch")=>({id,tenantId:"tenant",branchId,createdAt:"2026-10-11T12:00:00Z",payload:{branchId,requestKey:id,items:[{id:"item",quantity}]},status:"pending"});
const backup=orders=>JSON.stringify({format:"foon-pos-recovery-v1",tenantId:"tenant",orders});
test("backup restore rolls back all inserts on a later conflict, then retries without duplicate orders",async()=>{
 await queuePosOrder(order(id2));
 await assert.rejects(()=>importPendingPosOrders(backup([order(id1),order(id2,2)]),"tenant","branch"),/OFFLINE_ORDER_CONFLICT/);
 assert.deepEqual((await pendingPosOrders()).map(o=>o.id),[id2]);
 assert.equal(await importPendingPosOrders(backup([order(id1),order(id2)]),"tenant","branch"),1);
 assert.equal(await importPendingPosOrders(backup([order(id1),order(id2)]),"tenant","branch"),0);
 assert.equal((await pendingPosOrders()).length,2);
 await assert.rejects(()=>importPendingPosOrders(backup([order(id1),order(id1)]),"tenant","branch"),/DUPLICATE_OFFLINE_BACKUP_ORDER/);
 assert.equal((await pendingPosOrders()).length,2);
});
test("automatic retry preserves review evidence; explicit retry is tenant-scoped",async()=>{
 const id="33333333-3333-4333-8333-333333333333";
 await queuePosOrder({...order(id),status:"needs_review",lastError:"PRICE_CHANGED"});
 await queuePosOrder(order(id));
 assert.equal((await pendingPosOrders()).find(o=>o.id===id).lastError,"PRICE_CHANGED");
 await assert.rejects(()=>retryReviewedPosOrder(id,"other-tenant","branch"),/OFFLINE_RETRY_CONFLICT/);
 assert.equal((await pendingPosOrders()).find(o=>o.id===id).status,"needs_review");
 await retryReviewedPosOrder(id,"tenant","branch");
 assert.equal((await pendingPosOrders()).find(o=>o.id===id).status,"pending");
});


test("offline POS never exposes or syncs orders from a different tenant or branch",async()=>{
 const other="44444444-4444-4444-8444-444444444444";
 const foreign="55555555-5555-4555-8555-555555555555";
 await queuePosOrder(order(other,1,"other-branch"));
 await queuePosOrder({...order(foreign),tenantId:"other-tenant"});
 const items=await pendingPosOrders();
 const scoped=scopedPosOrders(items,"tenant","branch");
 assert(scoped.every(r=>r.tenantId==="tenant"&&r.branchId==="branch"&&r.payload.branchId==="branch"));
 assert(!scoped.some(r=>r.id===other||r.id===foreign));
 assert.equal(scopedPosOrders(items,"tenant","").length,0);
 const backupData=JSON.parse(await exportPendingPosOrders("tenant","branch"));
 assert.equal(backupData.branchId,"branch");
 assert(backupData.orders.every(r=>r.branchId==="branch"&&r.tenantId==="tenant"));
 assert(!backupData.orders.some(r=>r.id===other||r.id===foreign));
 await assert.rejects(()=>exportPendingPosOrders("tenant",""),/OFFLINE_BRANCH_REQUIRED/);
});
test("branch-scoped recovery rejects mixed-branch backups without writing any rows",async()=>{
 const current="66666666-6666-4666-8666-666666666666";
 const wrong="77777777-7777-4777-8777-777777777777";
 const before=(await pendingPosOrders()).length;
 const mixed=backup([order(current),order(wrong,1,"other-branch")]);
 await assert.rejects(()=>importPendingPosOrders(mixed,"tenant","branch"),/INVALID_OFFLINE_ORDER/);
 assert.equal((await pendingPosOrders()).length,before);
 await assert.rejects(()=>importPendingPosOrders(JSON.stringify({format:"foon-pos-recovery-v1",tenantId:"tenant",branchId:"other-branch",orders:[order(current)]}),"tenant","branch"),/INVALID_OFFLINE_BACKUP/);
 assert.equal((await pendingPosOrders()).length,before);
});
test("reviewed offline orders cannot be retried from another branch",async()=>{
 const id="88888888-8888-4888-8888-888888888888";
 await queuePosOrder({...order(id,1,"other-branch"),status:"needs_review"});
 await assert.rejects(()=>retryReviewedPosOrder(id,"tenant","branch"),/OFFLINE_RETRY_CONFLICT/);
 assert.equal((await pendingPosOrders()).find(row=>row.id===id).status,"needs_review");
 await retryReviewedPosOrder(id,"tenant","other-branch");
 assert.equal((await pendingPosOrders()).find(row=>row.id===id).status,"pending");
});

test("offline dine-in pre-check blocks unknown, unavailable, over-capacity and already-queued tables",()=>{
 const tables=[{id:"t1",branch_id:"branch",status:"available",data:{capacity:4}},{id:"t2",branch_id:"branch",status:"occupied",data:{capacity:4}},{id:"t3",status:"available",data:{capacity:4}},{id:"foreign",branch_id:"another-branch",status:"available",data:{capacity:4}},{id:"bad-capacity",status:"available"}];
 const queued=[{...order(id1),payload:{branchId:"branch",channel:"dine_in",tableId:"t3",partySize:2,items:[]}}];
 assert.equal(offlineTableBlock(tables,queued,"branch","t1",2),null);
 assert.equal(offlineTableBlock(tables,queued,"branch","",2),"TABLE_REQUIRED");
 assert.equal(offlineTableBlock(tables,queued,"branch","missing",2),"TABLE_UNKNOWN");
 assert.equal(offlineTableBlock(tables,queued,"branch","t2",2),"TABLE_NOT_AVAILABLE");
 assert.equal(offlineTableBlock(tables,queued,"branch","t1",5),"PARTY_SIZE");
 assert.equal(offlineTableBlock(tables,queued,"branch","t1",0),"PARTY_SIZE");
 assert.equal(offlineTableBlock(tables,queued,"branch","t3",2),"TABLE_QUEUED");
 assert.equal(offlineTableBlock(tables,queued,"other-branch","t3",2),null);
 assert.equal(offlineTableBlock(tables,queued,"branch","foreign",2),"TABLE_UNKNOWN");
 assert.equal(offlineTableBlock(tables,queued,"branch","bad-capacity",2),"TABLE_UNKNOWN");
 assert.equal(offlineTableBlock(tables,queued,"branch","t1",1.5),"PARTY_SIZE");
});
