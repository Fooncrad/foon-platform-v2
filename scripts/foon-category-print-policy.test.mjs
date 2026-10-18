import test from "node:test";
import assert from "node:assert/strict";
import {planCategoryPrintJobs,planCustomerReceipt,planPlatformSubscriptionInvoice} from "./foon-category-print-policy.mjs";

const tenantId="tenant-fixture",branchId="branch-fixture";
const scope={tenantId,branchId};
const printers=[
  {id:"print-grill",role:"section",scope:"merchant",enabled:true,...scope},
  {id:"print-coffee",role:"section",scope:"merchant",enabled:true,...scope},
  {id:"print-customer",role:"customer",scope:"merchant",enabled:true,...scope},
  {id:"print-admin",role:"platform-admin",scope:"platform",enabled:true},
  {id:"print-foreign",role:"section",scope:"merchant",enabled:true,tenantId:"other",branchId}
];
const catalogItems=[
  {id:"burger",name:"برجر",categoryId:"burgers",...scope},
  {id:"fries",name:"بطاطس",categoryId:"burgers",...scope},
  {id:"coffee",name:"قهوة",categoryId:"coffee",...scope}
];
const categoryAssignments=[
  {categoryId:"burgers",printerId:"print-grill",...scope},
  {categoryId:"coffee",printerId:"print-coffee",...scope}
];
const items=[
  {lineId:"line-1",itemId:"burger",quantity:2},
  {lineId:"line-2",itemId:"fries",quantity:1},
  {lineId:"line-3",itemId:"coffee",quantity:1}
];
const config=(extra={})=>({
  ...scope,orderId:"test-order",eventId:"production-event-1",
  items,catalogItems,categoryAssignments,printers,...extra
});

test("W14 routes all items via their trusted category, combining shared printer tickets",()=>{
  const result=planCategoryPrintJobs(config());
  assert.equal(result.jobs.length,2);
  const grill=result.jobs.find(job=>job.printerId==="print-grill");
  const coffee=result.jobs.find(job=>job.printerId==="print-coffee");
  assert.equal(grill.lines.length,2);
  assert.deepEqual(grill.lines.map(line=>line.itemId),["burger","fries"]);
  assert.equal(coffee.lines.length,1);
  assert(result.jobs.every(job=>job.tenantId===tenantId&&job.branchId===branchId));
});

test("W14 never trusts an item's browser-provided category/printer and job ids are stable",()=>{
  const forged=items.map(item=>({...item,categoryId:"coffee",printerId:"print-admin"}));
  const regular=planCategoryPrintJobs(config());
  const malicious=planCategoryPrintJobs(config({items:forged}));
  assert.deepEqual(malicious,regular);
  assert(regular.jobs.every(job=>/^[a-f0-9]{64}$/.test(job.jobId)));
  const otherEvent=planCategoryPrintJobs(config({eventId:"production-event-2"}));
  assert.notDeepEqual(otherEvent.jobs.map(x=>x.jobId),regular.jobs.map(x=>x.jobId));
});

test("W14 missing/duplicated binding and catalog data fail closed, not default printing",()=>{
  assert.throws(()=>planCategoryPrintJobs(config({
    categoryAssignments:categoryAssignments.filter(x=>x.categoryId!=="coffee")
  })),/PRINT_CATEGORY_PRINTER/);
  assert.throws(()=>planCategoryPrintJobs(config({
    categoryAssignments:[...categoryAssignments,categoryAssignments[0]]
  })),/PRINT_CATEGORY_PRINTER/);
  assert.throws(()=>planCategoryPrintJobs(config({
    catalogItems:[...catalogItems,catalogItems[0]]
  })),/PRINT_ITEM_NOT_FOUND/);
  assert.throws(()=>planCategoryPrintJobs(config({
    items:[items[0],items[0]]
  })),/PRINT_INVALID_ORDER_LINE/);
});

test("W14 refuses foreign branch/category bindings, disabled printers and roles",()=>{
  assert.throws(()=>planCategoryPrintJobs(config({
    catalogItems:catalogItems.map(item=>({...item,tenantId:"foreign"}))
  })),/PRINT_CATALOG_SCOPE/);
  assert.throws(()=>planCategoryPrintJobs(config({
    categoryAssignments:categoryAssignments.map(x=>({...x,branchId:"foreign"}))
  })),/PRINT_CATEGORY_PRINTER/);
  assert.throws(()=>planCategoryPrintJobs(config({
    printers:printers.map(p=>p.id==="print-grill"?{...p,enabled:false}:p)
  })),/PRINT_PRINTER_ROLE_UNAVAILABLE/);
  assert.throws(()=>planCategoryPrintJobs(config({
    categoryAssignments:categoryAssignments.map(a=>
      a.categoryId==="burgers"?{...a,printerId:"print-foreign"}:a)
  })),/PRINT_PRINTER_SCOPE_FORBIDDEN/);
});

test("W14 customer printer is separate from section tickets with customizable footer",()=>{
  const receipt=planCustomerReceipt({
    ...scope,orderId:"test-order",receiptId:"receipt-001",
    printerId:"print-customer",printers,footerText:"شكرًا لزيارتكم"
  });
  assert.equal(receipt.kind,"merchant-customer-receipt");
  assert.equal(receipt.printerId,"print-customer");
  assert.equal(receipt.footerText,"شكرًا لزيارتكم");
  assert.throws(()=>planCustomerReceipt({...scope,orderId:"x",receiptId:"r",
    printerId:"print-grill",printers}),/PRINT_PRINTER_ROLE_UNAVAILABLE/);
  assert.equal(planCustomerReceipt({...scope,orderId:"x",receiptId:"r",
    printerId:"print-customer",printers}).footerText,"");
});

test("W14 platform admin subscription invoices cannot reuse merchant printer",()=>{
  const admin=planPlatformSubscriptionInvoice({
    invoiceId:"subscription-test-invoice",printerId:"print-admin",printers
  });
  assert.equal(admin.kind,"platform-subscription-invoice");
  assert.equal(admin.printerId,"print-admin");
  assert.equal(admin.footerText,"");
  assert.throws(()=>planPlatformSubscriptionInvoice({
    invoiceId:"x",printerId:"print-customer",printers
  }),/PRINT_PRINTER_ROLE_UNAVAILABLE/);
  assert.throws(()=>planPlatformSubscriptionInvoice({
    invoiceId:"x",printerId:"print-foreign",printers
  }),/PRINT_PRINTER_ROLE_UNAVAILABLE/);
});

test("W14 idempotency keys never include order PII and no printer/DB/network side effects",()=>{
  const result=planCategoryPrintJobs(config());
  assert.equal(result.jobs.length,2);
  assert(result.jobs.every(job=>!job.jobId.includes("test-order")));
  assert.equal(result.unassigned,0);
  assert.notEqual(result.jobs[0].jobId,result.jobs[1].jobId);
});
