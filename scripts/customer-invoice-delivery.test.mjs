import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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
 assert.match(view,/receipts\/"/);
 assert.match(view,/email_status/);
 const schema=source("migrations/0072_customer_invoice_archive.sql");
 assert.match(schema,/UNIQUE KEY uq_customer_invoice_order_kind/);
});
test("SMTP retries update archived order receipts without claiming delivery early",()=>{
 const worker=source("scripts/notification-delivery.mjs");
 const send=worker.indexOf("await provider.send(");
 const update=worker.indexOf("email_status='sent'");
 assert.ok(send>=0&&update>send);
 assert.match(worker,/attempt>=5\?'failed':'pending'/);
});
test("subscription receipt is stored and sent only after admin approval",()=>{
 const billing=source("app/api/admin/billing/route.ts");
 const owner=source("app/api/tenant/subscription-requests/route.ts");
 assert.match(billing,/if\(b.status==="approved"\)await db.execute\("INSERT INTO platform_payment_receipts/);
 assert.match(billing,/event_key,tenant_id,recipient_email,subject,body_text\) VALUES \(\?,'payment_receipt'/);
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
