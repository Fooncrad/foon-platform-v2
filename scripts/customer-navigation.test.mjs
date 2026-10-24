import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
import {customerNavigation,currentCustomerSection,customerSectionIds} from "../lib/ux/customer-navigation.ts";
test("customer mobile navigation uses five distinct, existing section destinations in every language",()=>{
 for(const lang of ["ar","en","fr"]){
  const sections=customerNavigation(lang);
  assert.equal(sections.length,5);
  assert.equal(new Set(sections.map(s=>s.id)).size,5);
  assert.deepEqual(sections.map(s=>s.id),customerSectionIds);
  assert(sections.every(s=>s.href==="#"+s.id&&s.label.length>0&&s.icon.length>0));
 }
});
test("current location only follows recognized customer anchors",()=>{
 assert.equal(currentCustomerSection("#customer-orders"),"customer-orders");
 assert.equal(currentCustomerSection("#customer-addresses"),"customer-addresses");
 assert.equal(currentCustomerSection("#account-settings"),"account-settings");
 for(const invalid of ["","#fake","#admin","#customer-orders?other","#customer-top-foo"])
  assert.equal(currentCustomerSection(invalid),"customer-top");
});

test("private customer command center stays scoped to authenticated accounts and real sections",()=>{
 const page=read("app/customer/page.tsx");
 const hub=read("app/customer/customer-action-hub.tsx");
 const filter=read("app/customer/customer-order-filter.tsx");
 const css=read("app/customer/customer-experience.css");
 assert.match(page,/if\(!id\)redirect\("\/login"\)/);
 assert.match(page,/isEmployeeAccount\(id\)/);
 assert.match(page,/WHERE o.customer_user_id=\?/);
 assert.match(page,/WHERE user_id=\?/);
 assert.match(page,/CustomerActionHub/);
 assert.match(page,/CustomerOrderFilter/);
 assert.match(page,/data-phase=\{orderPhase\(order.status\)\}/);
 for(const anchor of ["#customer-orders","#customer-reservations","#customer-invoices","#customer-addresses","#customer-notifications"])assert.ok(hub.includes(anchor),anchor);
 for(const label of ["ar","en","fr"])assert.ok(hub.includes('language==="'+label+'"')||label==="ar","localized "+label);
 assert.match(hub,/verified\?\{/);
 assert.match(hub,/profileComplete/);
 assert.match(hub,/new.*Notifications|unreadNotifications/);
 assert.match(hub,/This dashboard is private/);
 assert.match(filter,/aria-pressed=\{phase===option.id\}/);
 assert.match(css,/\[data-filter="active"\]/);
 assert.match(css,/\[data-filter="finished"\]/);
 assert.match(css,/\[data-filter="cancelled"\]/);
});
test("customer delivery addresses appear only in the parent section, not duplicated in profile editor",()=>{
 const page=read("app/customer/page.tsx");
 const editor=read("app/customer/profile-editor.tsx");
 assert.match(page,/<CustomerDeliveryAddresses language=\{portalLanguage\}/);
 assert.doesNotMatch(editor,/CustomerDeliveryAddresses/);
 assert.match(editor,/customerProfilePrivacyNote/);
});
test("optional public creator profile keeps privacy barriers, multilingual visitors and safe sharing",()=>{
 const publicPage=read("app/creators/[handle]/page.tsx");
 const editor=read("app/customer/creator/creator-editor.tsx");
 const share=read("app/creators/[handle]/creator-public-share.tsx");
 assert.match(publicPage,/p.visibility='public'/);
 assert.match(publicPage,/NOT EXISTS \(SELECT 1 FROM memberships/);
 assert.match(publicPage,/NOT EXISTS \(SELECT 1 FROM platform_admins/);
 assert.match(publicPage,/CreatorPublicShare/);
 assert.match(publicPage,/lang=\{language\}/);
 assert.match(editor,/visibility:"private"/);
 assert.match(editor,/creatorProfileReadiness/);
 assert.match(editor,/saved\?\.visibility==="public"/);
 assert.match(share,/navigator\.share/);
 assert.match(share,/navigator\.clipboard\.writeText/);
 assert.doesNotMatch(publicPage,/SELECT.*customer_user_id|SELECT.*restaurant_orders/);
});
