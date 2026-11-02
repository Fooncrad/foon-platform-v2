import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {commissionAmount,percentToBasisPoints} from "../lib/creator/subscription-commission.ts";
const src=p=>readFileSync(new URL(p,import.meta.url),"utf8");

test("commission basis-point math uses cents without float and rounds half up",()=>{
 assert.equal(commissionAmount("100.00",1000),"10.00");
 assert.equal(commissionAmount("249.99",750),"18.75");
 assert.equal(commissionAmount("1000.00",125),"12.50");
 assert.equal(commissionAmount("0.01",5000),"0.01");
 assert.equal(commissionAmount("0.01",100),"0.00");
 assert.equal(commissionAmount("2000.00",700),"140.00");
 assert.equal(commissionAmount("9999999999.99",5000),"5000000000.00");
 for(const [sum,bps] of [["10.001",1000],["-10.00",1000],["1.00",-1],["1.00",10001]]){
  assert.throws(()=>commissionAmount(sum,bps),/COMMISSION_INPUT_INVALID/);
 }
});
test("global platform rate is decimal percent with two-decimal accuracy and 0-100 bounds",()=>{
 for(const [v,r] of [[0,0],[7.5,750],[0.01,1],[50,5000],[100,10000]])assert.equal(percentToBasisPoints(v),r);
 for(const v of [-1,100.01,7.555,"10",null,undefined,Infinity,NaN])assert.equal(percentToBasisPoints(v),null);
});
test("migration has immutable referral assignment and one commission per approved payment",()=>{
 const sql=src("../migrations/0152_creator_subscription_referrals.sql");
 assert.match(sql,/platform_creator_referral_settings/);
 assert.match(sql,/DEFAULT FALSE/);
 assert.match(sql,/INSERT IGNORE INTO platform_creator_referral_settings\(id,enabled,commission_basis_points\) VALUES \(1,FALSE,0\)/);
 assert.match(sql,/tenant_id VARCHAR\(36\) NOT NULL PRIMARY KEY/);
 assert.match(sql,/UNIQUE KEY uq_creator_commission_payment\(payment_request_id\)/);
 assert.match(sql,/ENUM\('monthly','yearly'\)/);
 assert.match(sql,/ENUM\('earned','paid','reversed'\)/);
});
test("signup attribution is server-checked for customer creator identity in every business onboarding path",()=>{
 const logic=src("../lib/creator/subscription-commission.ts");
 assert.match(logic,/p.user_id<>\?/);
 assert.match(logic,/NOT EXISTS \(SELECT 1 FROM memberships/);
 assert.match(logic,/NOT EXISTS \(SELECT 1 FROM platform_admins/);
 for(const p of ["../app/api/auth/register/route.ts","../app/api/restaurant/onboard/route.ts"]){
  const route=src(p);
  assert.match(route,/recordCreatorReferral\(db,workspace\.tenant\.id/);
  assert.match(route,/REFERRAL_INVALID/);
 }
});
test("paid receipt approval is the only automatic commission credit path",()=>{
 const route=src("../app/api/admin/billing/route.ts");
 assert.match(route,/if\(b.status==="approved"\)await creditApprovedSubscription\(db,rows\[0\]/);
 assert.match(route,/await db.commit\(\)/);
 assert.match(route,/PAID_PLAN_REQUIRED/);
 assert.match(route,/SELECT id,status,tenant_id,plan_id,billing_cycle,CAST\(amount AS CHAR\) AS amount,currency,transfer_reference FROM platform_payment_requests WHERE id=\? FOR UPDATE/);
 const other=src("../app/api/admin/subscriptions/route.ts");
 assert.doesNotMatch(other,/creditApprovedSubscription/);
});
test("owner must submit server-priced paid cycle; no employee or admin impersonation",()=>{
 const route=src("../app/api/tenant/subscription-requests/route.ts");
 assert.match(route,/requireTenantMembership\(user,id,\["owner"\]/);
 assert.match(route,/role.adminAccess/);
 assert.match(route,/p.code<>'free'/);
 assert.match(route,/pr.price>0/);
 assert.match(route,/SELECT id FROM tenants WHERE id=\? AND status='active' FOR UPDATE/);
 assert.match(route,/PAYMENT_ALREADY_PENDING/);
 assert.match(route,/assertSameOrigin/);
});
test("creator ledger is private, admin rate and payouts require super admin authorization",()=>{
 const creator=src("../app/api/account/creator-referrals/route.ts"),admin=src("../app/api/admin/creator-commissions/route.ts");
 assert.match(creator,/customerCreatorUserId/);
 assert.match(creator,/WHERE c.creator_user_id=\?/);
 assert.match(admin,/write\?\["super_admin"\]/);
 assert.match(admin,/WHERE c\.id=\? AND NOT EXISTS \(SELECT 1 FROM memberships[\s\S]*FOR UPDATE/);
 assert.match(admin,/rows\[0\]\.status!=="earned"/);
 assert.match(admin,/platform_audit_events/);
 assert.match(admin,/payout_reference/);
});
test("store customer checkout rejects missing or disabled entitlements",()=>{
 const checkout=src("../lib/payments/customer-checkout.ts");
 assert.match(checkout,/Number\(grants\[0\]\.enabled\)!==1/);
 assert.doesNotMatch(checkout,/enabled===null\?grants\[0\]\.code==="enterprise"/);
});

test("approved bank references are claimed atomically so the same deposit cannot buy two subscriptions",()=>{
 const sql=src("../migrations/0154_platform_approved_transfer_claims.sql");
 assert.match(sql,/PRIMARY KEY\(currency,transfer_reference\)/);
 assert.match(sql,/UNIQUE KEY uq_platform_transfer_claim_payment\(payment_request_id\)/);
 const billing=src("../app/api/admin/billing/route.ts");
 assert.match(billing,/INSERT INTO platform_approved_transfer_claims/);
 assert.match(billing,/TRANSFER_REFERENCE_ALREADY_APPROVED/);
});
test("creator dashboard shows current global percentage, unpaid/paid ledger and never reads merchant payment secrets",()=>{
 const api=src("../app/api/account/creator-referrals/route.ts");
 const view=src("../app/customer/creator/referral-earnings.tsx");
 assert.match(api,/SELECT enabled,commission_basis_points FROM platform_creator_referral_settings/);
 assert.match(api,/WHERE c.creator_user_id=\?/);
 assert.match(view,/rate.toFixed\(2\)/);
 assert.match(view,/earnings|Earnings|العمولة/);
 assert.doesNotMatch(api,/credentials_ciphertext|webhook_secret/);
});
