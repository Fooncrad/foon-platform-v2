import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {planCategoryPrintJobs,planCustomerReceipt,planPlatformSubscriptionInvoice} from './foon-category-print-policy.mjs';
import {openW15TemporaryPrintOutbox} from './foon-local-print-outbox.mjs';

const scope={tenantId:'test-tenant',branchId:'test-branch'};
const printers=[
  {id:'grill',role:'section',scope:'merchant',enabled:true,...scope},
  {id:'coffee',role:'section',scope:'merchant',enabled:true,...scope},
  {id:'customer',role:'customer',scope:'merchant',enabled:true,...scope},
  {id:'platform',role:'platform-admin',scope:'platform',enabled:true}
];
const catalogItems=[
  {id:'burger',name:'برجر',categoryId:'burger-category',...scope},
  {id:'cappuccino',name:'كابتشينو',categoryId:'coffee-category',...scope}
];
const categoryAssignments=[
  {categoryId:'burger-category',printerId:'grill',...scope},
  {categoryId:'coffee-category',printerId:'coffee',...scope}
];
function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'foon-w15-print-'));
  const path=join(dir,'print-jobs.sqlite');
  const q=()=>openW15TemporaryPrintOutbox({dbPath:path});
  const cleanup=()=>rmSync(dir,{recursive:true,force:true});
  return {q,cleanup,path};
}
function jobs(){
  const sections=planCategoryPrintJobs({...scope,orderId:'synthetic-order',eventId:'synth-event',
    items:[{lineId:'a',itemId:'burger',quantity:1},{lineId:'b',itemId:'cappuccino',quantity:2}],
    catalogItems,categoryAssignments,printers}).jobs;
  const customer=planCustomerReceipt({...scope,orderId:'synthetic-order',receiptId:'receipt-1',printerId:'customer',printers});
  const platform=planPlatformSubscriptionInvoice({invoiceId:'invoice-1',printerId:'platform',printers});
  return [...sections,customer,platform];
}

test('W15 persists 4 print jobs through SQLite shutdown, idempotently replaying same event',()=>{
  const env=fixture();let queue=env.q();
  try{
    const all=jobs();
    assert.deepEqual(queue.enqueue(all),{inserted:4,duplicates:0});
    assert.deepEqual(queue.enqueue(all),{inserted:0,duplicates:4});
    queue.close();queue=env.q();
    assert.equal(queue.listMetadata().length,4);
    assert.equal(queue.summary().states.find(x=>x.state==='pending').total,4);
    assert.deepEqual(queue.enqueue(all),{inserted:0,duplicates:4});
  }finally{queue.close();env.cleanup();}
});

test('W15 atomic batch rejects mutated print job replay without partial additions',()=>{
  const env=fixture();const queue=env.q();
  try{
    const a=jobs();queue.enqueue(a);
    const forged={...a[0],printerId:'platform'};
    const b=[{...a[0],jobId:'a'.repeat(64)},forged];
    assert.throws(()=>queue.enqueue(b),/W15_IDEMPOTENCY_CONFLICT/);
    assert.equal(queue.listMetadata().length,4);
    assert.throws(()=>queue.enqueue([a[0],a[0]]),/W15_DUPLICATE_BATCH_JOB/);
  }finally{queue.close();env.cleanup();}
});

test('W15 only dispatches selected printer, rejects wrong token, confirms only after dispatch',()=>{
  const env=fixture();const queue=env.q();
  try{
    queue.enqueue(jobs());
    const claim=queue.claim({printerId:'grill',workerId:'test-worker'});
    assert.equal(claim.printerId,'grill');
    assert.equal(claim.payload.kind,'merchant-section');
    assert.equal(claim.payload.lines[0].itemId,'burger');
    assert.equal(queue.claim({printerId:'grill',workerId:'different-worker'}),null);
    assert.throws(()=>queue.markPrinted({jobId:claim.jobId,token:claim.token}),/W15_DISPATCH_NOT_ACTIVE/);
    assert.throws(()=>queue.beginDispatch({jobId:claim.jobId,token:'wrong-token'}),/W15_CLAIM_NOT_ACTIVE/);
    queue.beginDispatch({jobId:claim.jobId,token:claim.token});
    assert.throws(()=>queue.markPrinted({jobId:claim.jobId,token:'wrong-token'}),/W15_DISPATCH_NOT_ACTIVE/);
    assert.equal(queue.markPrinted({jobId:claim.jobId,token:claim.token}),true);
    assert.throws(()=>queue.markPrinted({jobId:claim.jobId,token:claim.token}),/W15_DISPATCH_NOT_ACTIVE/);
    assert.equal(queue.claim({printerId:'grill',workerId:'worker'}),null);
    assert.equal(queue.claim({printerId:'coffee',workerId:'worker'}).printerId,'coffee');
  }finally{queue.close();env.cleanup();}
});

test('W15 crash AFTER possible printing recovers as unknown, never automatically reprints',()=>{
  const env=fixture();let queue=env.q();
  try{
    queue.enqueue(jobs());
    const c=queue.claim({printerId:'grill',workerId:'worker'});
    queue.beginDispatch({jobId:c.jobId,token:c.token});
    queue.close();queue=env.q();
    assert.equal(queue.summary().states.find(x=>x.state==='unknown').total,1);
    assert.equal(queue.claim({printerId:'grill',workerId:'worker'}),null);
    assert.throws(()=>queue.markPrinted({jobId:c.jobId,token:c.token}),/W15_DISPATCH_NOT_ACTIVE/);
    assert.equal(queue.manualReview({jobId:c.jobId,operatorId:'authorized-test-operator',decision:'confirm-printed'}).state,'printed');
    assert.equal(queue.claim({printerId:'grill',workerId:'worker'}),null);
    assert.equal(queue.summary().reviews,1);
  }finally{queue.close();env.cleanup();}
});

test('W15 explicit reviewed not printed permits one controlled resend',()=>{
  const env=fixture();let queue=env.q();
  try{
    queue.enqueue(jobs());
    const c=queue.claim({printerId:'coffee',workerId:'worker'});
    queue.beginDispatch({jobId:c.jobId,token:c.token});
    queue.markUnknown({jobId:c.jobId,token:c.token});
    assert.equal(queue.claim({printerId:'coffee',workerId:'worker'}),null);
    assert.throws(()=>queue.manualReview({jobId:c.jobId,operatorId:'x',decision:'unreviewed'}),/W15_INVALID_REVIEW/);
    queue.manualReview({jobId:c.jobId,operatorId:'staff-privileged',decision:'confirmed-not-printed'});
    assert.equal(queue.claim({printerId:'coffee',workerId:'worker'}).jobId,c.jobId);
    assert.equal(queue.summary().reviews,1);
  }finally{queue.close();env.cleanup();}
});

test('W15 expired lease BEFORE dispatch can be reclaimed without ambiguity',()=>{
  const env=fixture();const queue=env.q();
  try{
    queue.enqueue(jobs(),100);
    const c=queue.claim({printerId:'grill',workerId:'worker',ms:200,leaseMs:1000});
    assert.equal(queue.recover(1199).released,0);
    assert.equal(queue.recover(1200).released,1);
    const next=queue.claim({printerId:'grill',workerId:'worker',ms:1201});
    assert.notEqual(next.token,c.token);
    assert.throws(()=>queue.beginDispatch({jobId:c.jobId,token:c.token,ms:1202}),/W15_CLAIM_NOT_ACTIVE/);
  }finally{queue.close();env.cleanup();}
});

test('W15 two worker processes with different SQLite handles cannot claim same pending job',()=>{
  const env=fixture();const first=env.q();const second=env.q();
  try{
    first.enqueue(jobs());
    const one=first.claim({printerId:'grill',workerId:'worker-a'});
    const two=second.claim({printerId:'grill',workerId:'worker-b'});
    assert(one);assert.equal(two,null);
    second.close();first.releaseBeforeDispatch({jobId:one.jobId,token:one.token});
    const again=first.claim({printerId:'grill',workerId:'worker-c'});
    assert.equal(again.jobId,one.jobId);
  }finally{first.close();env.cleanup();}
});

test('W15 restricts sqlite to freshly created disposable temp folder only',()=>{
  assert.throws(()=>openW15TemporaryPrintOutbox({dbPath:'/tmp/restaurant.sqlite'}),/W15_TEMP_DB_PATH_REQUIRED/);
  assert.throws(()=>openW15TemporaryPrintOutbox({dbPath:join(tmpdir(),'orders.sqlite')}),/W15_TEMP_DB_PATH_REQUIRED/);
  assert.throws(()=>openW15TemporaryPrintOutbox({dbPath:join(tmpdir(),'print-jobs.sqlite')}),/W15_TEMP_DB_PATH_FORBIDDEN/);
});

test('W15 queue metadata never prints sensitive receipt notes and close invalidates handles',()=>{
  const env=fixture();const queue=env.q();
  try{
    queue.enqueue(jobs());
    const summary=queue.listMetadata();
    assert(!JSON.stringify(summary).includes('شكرًا'));
    assert(summary.every(row=>!Object.hasOwn(row,'payload_json')));
    queue.close();
    assert.throws(()=>queue.enqueue(jobs()),/W15_QUEUE_CLOSED/);
  }finally{queue.close();env.cleanup();}
});
