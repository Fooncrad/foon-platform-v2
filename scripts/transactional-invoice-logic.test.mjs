import test from "node:test";
import assert from "node:assert/strict";
import {issuePaidOrderInvoice} from "../lib/billing/order-invoices.ts";
import {queueCommissionNotice} from "../lib/creator/commission-notices.ts";

function paidOrderFixture({paid=true,verified=true,alreadyIssued=false,guest=false,status="completed"}={}){
 const calls=[];let exists=alreadyIssued;
 const db={async execute(sql,args=[]){
  calls.push({sql,args});
  if(sql.includes("FROM restaurant_orders o JOIN tenants"))return [guest?[]:[{
   id:"order-1",branch_id:"branch-1",order_number:1001,customer_user_id:"customer-1",payment_status:paid?"paid":"unpaid",
   status,subtotal:"99.00",discount:"4.00",total:"95.00",currency:"SAR",checkout_snapshot:JSON.stringify({seller:{name:"Store",taxNumber:"123"},tax:0}),
   store_name:"Store",email:"buyer@test.example",email_verified_at:verified?"2026-10-21":null,default_locale:"en"
  }]];
  if(sql.includes("FROM restaurant_order_items"))return [[{item_name:"Coffee",quantity:1,unit_price:"99.00",line_total:"99.00",options_snapshot:null}]];
  if(sql.includes("INSERT IGNORE INTO restaurant_customer_invoices")){const added=exists?0:1;exists=true;return [{affectedRows:added}];}
  return [{affectedRows:1}];
 }};
 return {db,calls};
}
const count=(calls,needle)=>calls.filter(({sql})=>sql.includes(needle)).length;
test("verified, paid customer receives an immutable invoice, account notification, and one queued email",async()=>{
 const f=paidOrderFixture();const result=await issuePaidOrderInvoice(f.db,"tenant-1","order-1");
 assert.equal(result?.emailQueued,true);
 assert.equal(count(f.calls,"INSERT IGNORE INTO restaurant_customer_invoices"),1);
 assert.equal(count(f.calls,"INSERT INTO customer_notifications"),1);
 assert.equal(count(f.calls,"INSERT INTO platform_notification_outbox"),1);
 const invoice=f.calls.find(({sql})=>sql.includes("INSERT IGNORE INTO restaurant_customer_invoices"));
 const snapshot=JSON.parse(invoice.args[6]);assert.equal(snapshot.total,"95.00");assert.equal(snapshot.lines[0].name,"Coffee");
 const email=f.calls.find(({sql})=>sql.includes("INSERT INTO platform_notification_outbox"));
 assert.match(email.args[4],/customer\/invoices\//);
 assert.match(email.args[4],/Coffee/);
});
test("unverified email still gets private in-account invoice but no external mail",async()=>{
 const f=paidOrderFixture({verified:false});const result=await issuePaidOrderInvoice(f.db,"tenant-1","order-1");
 assert.equal(result?.emailQueued,false);assert.equal(count(f.calls,"INSERT INTO customer_notifications"),1);
 assert.equal(count(f.calls,"INSERT INTO platform_notification_outbox"),0);
 assert.equal(f.calls.find(({sql})=>sql.includes("INSERT IGNORE")).args.at(-1),"skipped");
});
test("unpaid, refunded or guest order never gets a paid receipt",async()=>{
 for(const options of [{paid:false},{status:"refunded"},{guest:true}]){
  const f=paidOrderFixture(options);assert.equal(await issuePaidOrderInvoice(f.db,"tenant-1","order-1"),null);
  assert.equal(count(f.calls,"INSERT IGNORE INTO restaurant_customer_invoices"),0);
 }
});
test("replaying the same confirmed payment does not queue another email",async()=>{
 const f=paidOrderFixture();
 await issuePaidOrderInvoice(f.db,"tenant-1","order-1");
 await issuePaidOrderInvoice(f.db,"tenant-1","order-1");
 assert.equal(count(f.calls,"INSERT INTO customer_notifications"),1);
 assert.equal(count(f.calls,"INSERT INTO platform_notification_outbox"),1);
});
function commissionFixture({status="earned",verified=true}={}){
 const calls=[];
 const db={async execute(sql,args=[]){calls.push({sql,args});
  if(sql.includes("FROM customer_creator_commissions c JOIN tenants"))return [[{
   id:"commission-1",tenant_id:"tenant-1",creator_user_id:"creator-1",status,amount:"12.50",currency:"SAR",
   tenant_name:"Store",email:"creator@test.example",email_verified_at:verified?"2026-10-21":null,default_locale:"en"
  }]];
  return [{affectedRows:1}];
 }};
 return {db,calls};
}
test("earned and paid commission events create account and platform-funded email notifications",async()=>{
 for(const event of ["earned","paid","reversed"]){
  const f=commissionFixture({status:event});await queueCommissionNotice(f.db,"commission-1",event);
  assert.equal(count(f.calls,"INSERT INTO customer_notifications"),1);
  assert.equal(count(f.calls,"INSERT INTO platform_notification_outbox"),1);
  assert.match(f.calls.find(({sql})=>sql.includes("INSERT INTO platform_notification_outbox")).sql,/NULL/);
 }
});
test("creator unverified emails are not sent; mismatched payout events are not reported",async()=>{
 const f=commissionFixture({verified:false});await queueCommissionNotice(f.db,"commission-1","earned");
 assert.equal(count(f.calls,"INSERT INTO customer_notifications"),1);
 assert.equal(count(f.calls,"INSERT INTO platform_notification_outbox"),0);
 const different=commissionFixture();await queueCommissionNotice(different.db,"commission-1","paid");
 assert.equal(count(different.calls,"INSERT INTO customer_notifications"),0);
});
