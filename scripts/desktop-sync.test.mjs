import test from 'node:test';
import assert from 'node:assert/strict';
import {desktopSyncConfig} from '../lib/platform/desktop-sync-config.mjs';
import {desktopOrderEvent,queueDesktopOrderEvent} from '../lib/platform/desktop-sync-outbox.mjs';
import {syncDesktopBatch} from '../lib/platform/desktop-sync-worker.mjs';
import {eventDigest} from './foon-edge-sync-contract.mjs';
import {signCloudReceipt} from '../lib/platform/edge-sync-receipt-signature.mjs';
const id='11111111-1111-4111-8111-111111111111';
const config={cloudUrl:'https://cloud.example/api/edge/sync',deviceId:id,tenantId:id,branchId:id,actorUserId:id,token:'a'.repeat(96),receiptKey:'b'.repeat(64)};
const order={id,tenant_id:id,branch_id:id,status:'new',payment_status:'unpaid',channel:'takeaway',discount:'0.00',total:'19.90',currency:'SAR',created_at:new Date(),checkout_snapshot:'{}'};
const lines=[{menu_item_id:id,menu_exists:id,quantity:2,unit_price:'9.95',options_snapshot:'[]'}];
test('desktop configuration is opt-in, HTTPS and scope constrained',()=>{
  assert.equal(desktopSyncConfig(''),null);
  assert.deepEqual(desktopSyncConfig(config),config);
  for(const url of ['http://cloud.example/api/edge/sync','https://127.0.0.1/api/edge/sync','https://cloud.example/api/admin/users','https://cloud.example/api/edge/sync?token=secret'])assert.throws(()=>desktopSyncConfig({...config,cloudUrl:url}));
  assert.throws(()=>desktopSyncConfig({...config,token:'short'}));
  assert.throws(()=>desktopSyncConfig({...config,tenantId:'foreign'}));
});
test('persisted order snapshots bind unit prices, currency and full checkout total',()=>{
  const event=desktopOrderEvent(order,lines,{kind:'created',actorUserId:id},config);
  assert.equal(event.error,null);
  assert.equal(event.payload.expectedTotalCents,1990);
  assert.deepEqual(event.payload.items,[{id,quantity:2,expectedUnitCents:995,expectedCurrency:'SAR'}]);
  assert.throws(()=>desktopOrderEvent({...order,branch_id:'foreign'},lines,{kind:'created',actorUserId:id},config));
});
test('unsupported payments, choices and actors are preserved for review, never simplified',()=>{
  assert.equal(desktopOrderEvent(order,lines,{kind:'created',actorUserId:id,requestedPayment:'paid'},config).error,'DESKTOP_PAYMENT_REVIEW_REQUIRED');
  for(const change of [{channel:'delivery'},{customer_name:'Guest'},{discount:'1.00'}])assert.equal(desktopOrderEvent({...order,...change},lines,{kind:'created',actorUserId:id},config).error,'DESKTOP_ORDER_REVIEW_REQUIRED');
  assert.equal(desktopOrderEvent(order,[{...lines[0],options_snapshot:'[{"name":"Choice"}]'}],{kind:'created',actorUserId:id},config).error,'DESKTOP_ORDER_REVIEW_REQUIRED');
  assert.equal(desktopOrderEvent(order,lines,{kind:'created',actorUserId:'foreign'},config).error,'DESKTOP_ACTOR_REVIEW_REQUIRED');
});
test('expired/revoked desktop authorization cannot enqueue or commit a business event',async()=>{
  const calls=[];
  await assert.rejects(()=>queueDesktopOrderEvent({execute:async(sql)=>{calls.push(sql);return [[{actor_user_id:id,state:'blocked',valid_lease:1}]];}},{tenantId:id,actorUserId:id,orderId:id,kind:'created'},config),/REAUTHENTICATION/);
  assert.equal(calls.length,1);
});
test('a cloud view-only lease cannot grant local order creation',async()=>{
 let calls=0;
 await assert.rejects(()=>queueDesktopOrderEvent({execute:async()=>{calls++;return [[{actor_user_id:id,state:'active',valid_lease:1,can_create:0,can_update:0}]];}},{tenantId:id,actorUserId:id,orderId:id,kind:'created'},config),/FORBIDDEN/);
 assert.equal(calls,1);
});
function workerFixture({tampered=false,locked=false}={}){
  const event={seq:1,order_id:id,kind:'created',payload:{id,branchId:id,status:'new',createdAt:new Date().toISOString(),items:[{id,quantity:2,expectedUnitCents:995,expectedCurrency:'SAR'}]}};
  const row={id:1,device_id:id,tenant_id:id,branch_id:id,order_id:id,kind:'created',payload:JSON.stringify(event.payload),digest:tampered?'0'.repeat(64):eventDigest(event),state:'pending',attempts:0};
  const writes=[];
  const connection={async execute(sql,params){
    if(sql.includes('GET_LOCK'))return [[{acquired:locked?0:1}]];
    if(sql.startsWith('SELECT m.role'))return [[{role:'owner'}]];
    if(sql.startsWith('SELECT tenant_id'))return [[{tenant_id:id,branch_id:id,actor_user_id:id}]];
    if(sql.startsWith('SELECT * FROM desktop_sync_outbox'))return [[row]];
    writes.push({sql,params});return [{affectedRows:1}];
  },async beginTransaction(){},async commit(){writes.push({sql:'COMMIT'});},async rollback(){},release(){}};
  const catalog={identity:{...config,role:'owner'},permissions:{createOrders:true,updateOrders:true},mode:'plain_takeaway',savedAt:new Date().toISOString(),validUntil:new Date(Date.now()+3600000).toISOString()};
  return {pool:{getConnection:async()=>connection},row,event,writes,catalog};
}
test('lost or forged receipts leave the original event retryable; only signed matching ACK commits',async()=>{
  for(const mode of ['lost','forged','valid']){
    const f=workerFixture();let sent=0;
    const result=await syncDesktopBatch(f.pool,config,{fetchImpl:async(url)=>{
      if(new URL(url).pathname.endsWith('/catalog'))return Response.json(f.catalog);
      sent++;if(mode==='lost')throw Error('network lost after commit');
      let receipt=signCloudReceipt({receiptId:'receipt-123',deviceId:id,eventSeq:1,orderId:id,digest:f.row.digest},config.receiptKey);
      if(mode==='forged')receipt={...receipt,signature:'0'.repeat(64)};
      return Response.json({receipt},{status:201});
    }});
    assert.equal(sent,1);
    assert.equal(result.synced,mode==='valid'?1:0);
    assert.equal(f.writes.some(w=>w.sql==='COMMIT'),mode==='valid');
    if(mode!=='valid')assert(f.writes.some(w=>w.params?.[0]==='retrying'));
  }
});
test('corrupt outbox data never reaches cloud and a concurrent scheduler cannot own the batch',async()=>{
  for(const options of [{tampered:true},{locked:true}]){
    const f=workerFixture(options);let posts=0;
    const result=await syncDesktopBatch(f.pool,config,{fetchImpl:async(url)=>{if(new URL(url).pathname.endsWith('/catalog'))return Response.json(f.catalog);posts++;throw Error();}});
    assert.equal(posts,0);
    assert(options.locked?result.busy:result.conflicts===1);
  }
});
test('catalog identity mismatch blocks the device without issuing an upload',async()=>{
  const f=workerFixture();f.catalog.identity.tenantId='foreign';
  await assert.rejects(()=>syncDesktopBatch(f.pool,config,{fetchImpl:async()=>Response.json(f.catalog)}),/SCOPE_MISMATCH/);
  assert(f.writes.some(w=>w.sql.includes("state='blocked'")));
});
