import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openW15TemporaryPrintOutbox} from './foon-local-print-outbox.mjs';
import {queueTrustedPrintEvent,processOneSyntheticPrinterJob} from './foon-print-test-coordinator.mjs';
const scope={tenantId:'demo-company',branchId:'branch-1'};
const printers=[
  {id:'grill',role:'section',scope:'merchant',enabled:true,...scope},
  {id:'coffee',role:'section',scope:'merchant',enabled:true,...scope},
  {id:'client',role:'customer',scope:'merchant',enabled:true,...scope},
  {id:'admin',role:'platform-admin',scope:'platform',enabled:true}
];
const catalogItems=[
  {id:'hamburger',name:'برجر',categoryId:'burgers',...scope},
  {id:'latte',name:'لاتيه',categoryId:'coffee',...scope}
];
const categoryAssignments=[
  {categoryId:'burgers',printerId:'grill',...scope},
  {categoryId:'coffee',printerId:'coffee',...scope}
];
const event={kind:'merchant-order',...scope,orderId:'order-1',eventId:'event-1',printers,
  items:[{lineId:'line-1',itemId:'hamburger',quantity:1},{lineId:'line-2',itemId:'latte',quantity:2}],catalogItems,categoryAssignments};
function make(){
  const dir=mkdtempSync(join(tmpdir(),'foon-w15-print-'));
  const dbPath=join(dir,'print-jobs.sqlite');
  return {open:()=>openW15TemporaryPrintOutbox({dbPath}),dispose:()=>rmSync(dir,{recursive:true,force:true})};
}
test('W16 end to end: merchant order maps to section printers and persists across restart',async()=>{
  const f=make();let q=f.open();
  try{
    assert.deepEqual(queueTrustedPrintEvent(q,event),{inserted:2,duplicates:0});
    q.close();q=f.open();
    assert.deepEqual(queueTrustedPrintEvent(q,event),{inserted:0,duplicates:2});
    const a=await processOneSyntheticPrinterJob({queue:q,printerId:'grill',workerId:'section-worker',simulateDriver:async()=>true});
    const b=await processOneSyntheticPrinterJob({queue:q,printerId:'coffee',workerId:'section-worker',simulateDriver:async()=>true});
    assert.equal(a.state,'printed');assert.equal(b.state,'printed');
    assert.equal(q.summary().states.find(x=>x.state==='printed').total,2);
  }finally{q.close();f.dispose();}
});
test('W16 separates customer and platform subscription invoices from sections',()=>{
  const f=make();const q=f.open();
  try{
    const client={kind:'merchant-customer-receipt',...scope,orderId:'o-2',receiptId:'r-1',printerId:'client',printers};
    const admin={kind:'platform-subscription-invoice',invoiceId:'a-1',printerId:'admin',printers};
    assert.equal(queueTrustedPrintEvent(q,client).inserted,1);
    assert.equal(queueTrustedPrintEvent(q,admin).inserted,1);
    assert.deepEqual(q.listMetadata().map(x=>x.printer_id).sort(),['admin','client']);
    assert.equal(q.claim({printerId:'grill',workerId:'worker'}),null);
  }finally{q.close();f.dispose();}
});
test('W16 external printer failure becomes unknown, never automatically reprints',async()=>{
  const f=make();let q=f.open();
  try{
    queueTrustedPrintEvent(q,event);
    const result=await processOneSyntheticPrinterJob({queue:q,printerId:'grill',workerId:'worker',simulateDriver:async()=>{throw Error('printer may have printed');}});
    assert.equal(result.state,'unknown');
    q.close();q=f.open();
    assert.equal(q.claim({printerId:'grill',workerId:'worker'}),null);
    q.manualReview({jobId:result.jobId,operatorId:'authorized-fixture',decision:'confirmed-not-printed'});
    assert.equal((await processOneSyntheticPrinterJob({queue:q,printerId:'grill',workerId:'worker',simulateDriver:async()=>true})).state,'printed');
    assert.equal(q.summary().reviews,1);
  }finally{q.close();f.dispose();}
});
test('W16 wrong branch, untrusted category and forbidden admin printer fail before queue mutation',()=>{
  const f=make();const q=f.open();
  try{
    assert.throws(()=>queueTrustedPrintEvent(q,{...event,branchId:'other-branch'}),/PRINT_CATALOG_SCOPE/);
    assert.throws(()=>queueTrustedPrintEvent(q,{...event,categoryAssignments:[]}),/PRINT_CATEGORY_PRINTER/);
    assert.throws(()=>queueTrustedPrintEvent(q,{kind:'platform-subscription-invoice',invoiceId:'x',printerId:'grill',printers}),/PRINT_PRINTER_ROLE/);
    assert.equal(q.listMetadata().length,0);
  }finally{q.close();f.dispose();}
});
test('W16 status readback never returns printer-token, customer note, or full ticket payload',async()=>{
  const f=make();const q=f.open();
  try{
    queueTrustedPrintEvent(q,event);
    const status=q.summary();
    const meta=q.listMetadata();
    assert(!JSON.stringify(meta).includes('برجر'));
    assert(!JSON.stringify(status).includes('private-key'));
    assert(meta.every(item=>!('payload_json' in item)&&!('claim_token' in item)));
    assert.equal((await processOneSyntheticPrinterJob({queue:q,printerId:'bogus',workerId:'worker',simulateDriver:async()=>true})).state,'empty');
  }finally{q.close();f.dispose();}
});
