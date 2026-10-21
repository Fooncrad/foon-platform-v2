import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {issuePaidOrderInvoice} from "../lib/billing/order-invoices.ts";
const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("paid order triggers one immutable receipt and no invoice on checkout creation",()=>{
 const notifications=source("lib/notifications/customer.ts");
 const invoice=source("lib/billing/order-invoices.ts");
 assert.match(notifications,/payment&&status==='paid'/);
 assert.match(notifications,/issuePaidOrderInvoice\(db,tenantId,id\)/);
 assert.match(invoice,/order\.payment_status!=="paid"/);
 assert.match(invoice,/\["cancelled","rejected","refunded"\]/);
 assert.match(invoice,/INSERT IGNORE INTO restaurant_customer_invoices/);
 assert.match(invoice,/invoice_kind,invoice_json/);
 assert.match(invoice,/INSERT INTO platform_notification_outbox/);
 assert.match(invoice,/INSERT INTO customer_notifications/);
 assert.match(invoice,/email_verified_at/);
});
test("receipt belongs to the customer and is accessible in their account independently of SMTP",()=>{
 const api=source("app/api/customer/invoices/route.ts");
 const view=source("app/customer/invoice-archive.tsx");
 assert.match(api,/employeePersonalAccessDenied/);
 assert.match(api,/i.customer_user_id=\? AND o.customer_user_id=\?/);
 assert.match(api,/o.id AS order_id/);
 assert.match(view,/customer\/invoices/);
 assert.match(view,/email_status/);
 const schema=source("migrations/0072_customer_invoice_archive.sql");
 assert.match(schema,/UNIQUE KEY uq_customer_invoice_order_kind/);
});
test("SMTP retries update archived order receipts without claiming delivery early",()=>{
 const worker=source("scripts/notification-delivery.mjs");
 const send=worker.indexOf("await provider.send(");
 const outbox=worker.indexOf("UPDATE platform_notification_outbox SET status='sent'",send);
 const archive=worker.indexOf("UPDATE restaurant_customer_invoices SET email_status='sent'",send);
 assert.ok(send>=0&&outbox>send&&archive>outbox);
 assert.match(worker,/attempt>=5\?'failed':'pending'/);
});
test("subscription receipt is stored and sent only after admin approval",()=>{
 const billing=source("app/api/admin/billing/route.ts");
 const owner=source("app/api/tenant/subscription-requests/route.ts");
 assert.match(billing,/if\(b.status==="approved"\)await db.execute\("INSERT INTO platform_payment_receipts/);
 assert.match(billing,/event_key,tenant_id,recipient_email,subject,body_text\) VALUES \(\?,'payment_receipt',NULL/);
 assert.match(owner,/requireTenantMembership\(user,id,\["owner"\]/);
 assert.match(owner,/p.status='approved'/);
 assert.match(owner,/platform_payment_receipts/);
});
test("creator commission is earned once, and payout evidence is limited to the owner",()=>{
 const creator=source("lib/creator/subscription-commission.ts");
 const notice=source("lib/creator/commission-notices.ts");
 const admin=source("app/api/admin/creator-commissions/route.ts");
 const receipt=source("app/customer/creator/referrals/[id]/page.tsx");
 assert.match(creator,/queueCommissionNotice\(db,commissionId,"earned"\)/);
 assert.match(admin,/queueCommissionNotice\(db,body.id,body.status\)/);
 assert.match(admin,/rows\[0\]\.status!=="earned"/);
 assert.match(notice,/VALUES \(\?,\?,NULL,\?,\?,\?\)/);
 assert.match(receipt,/c.creator_user_id=\?/);
 assert.match(receipt,/customerCreatorUserId/);
});

test("runtime: receipt issuance is paid-only, idempotent and keeps unverified email out of SMTP",async()=>{
 async function scenario({payment="paid",status="completed",verified=true}={}){
  let inserts=0;
  const writes=[];
  const db={async execute(sql,args){
   if(sql.startsWith("SELECT o.id,o.branch_id"))return [[{
    id:"order-1",branch_id:"branch-1",order_number:123,customer_user_id:"customer-1",
    payment_status:payment,status,subtotal:"90.00",discount:"0.00",total:"100.00",
    currency:"SAR",checkout_snapshot:JSON.stringify({tax:"10.00"}),store_name:"Test Store",
    email:"customer@example.test",email_verified_at:verified?"2026-10-21":null,default_locale:"en"
   }]];
   if(sql.startsWith("SELECT item_name"))return [[{item_name:"Item",quantity:2,unit_price:"45.00",line_total:"90.00",options_snapshot:null}]];
   writes.push({sql,args});
   if(sql.startsWith("INSERT IGNORE INTO restaurant_customer_invoices"))return [{affectedRows:inserts++===0?1:0}];
   return [{affectedRows:1}];
  }};
  const first=await issuePaidOrderInvoice(db,"tenant-1","order-1");
  const replay=await issuePaidOrderInvoice(db,"tenant-1","order-1");
  const count=part=>writes.filter(row=>row.sql.includes(part)).length;
  return {first,replay,notices:count("INSERT INTO customer_notifications"),emails:count("INSERT INTO platform_notification_outbox"),
   invoices:count("INSERT IGNORE INTO restaurant_customer_invoices"),
   state:writes.find(row=>row.sql.startsWith("INSERT IGNORE INTO restaurant_customer_invoices"))?.args.at(-1)};
 }
 const paid=await scenario();
 assert.equal(paid.first?.emailQueued,true);
 assert.equal(paid.replay,null);
 assert.equal(paid.invoices,2);
 assert.equal(paid.notices,1);
 assert.equal(paid.emails,1);
 assert.equal((await scenario({payment:"pending"})).invoices,0);
 assert.equal((await scenario({status:"cancelled"})).invoices,0);
 const unverified=await scenario({verified:false});
 assert.equal(unverified.first?.emailQueued,false);
 assert.equal(unverified.state,"skipped");
 assert.equal(unverified.notices,1);
 assert.equal(unverified.emails,0);
});
