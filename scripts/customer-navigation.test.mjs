import test from "node:test";
import assert from "node:assert/strict";
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
