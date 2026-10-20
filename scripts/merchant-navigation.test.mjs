import test from "node:test";
import assert from "node:assert/strict";
import {MERCHANT_NAV_GROUPS,MERCHANT_NAV_LABELS,merchantNavGroupFor,groupVisibleMerchantSections} from "../lib/ux/merchant-navigation.ts";
const sections=["assigned","overview","branches","orders","pos","kds","menu","tables","roomService","inventory","pickupPoints","serviceOrders","quotes","printers","team","marketing","reservations","reports","customers","storefront","publicControls","remote","payments","security","health","subscription"];
test("every current merchant module has exactly one task group and trilingual heading",()=>{
 const grouped=groupVisibleMerchantSections(sections.map(key=>({key})));
 assert.deepEqual(grouped.flatMap(group=>group.items.map(item=>item.key)).sort(),[...sections].sort());
 assert.equal(new Set(grouped.flatMap(group=>group.items.map(item=>item.key))).size,sections.length);
 assert.deepEqual(grouped.map(g=>g.key),MERCHANT_NAV_GROUPS);
 for(const key of MERCHANT_NAV_GROUPS)for(const language of ["ar","en","fr"])assert(MERCHANT_NAV_LABELS[key][language].length>0);
});
test("grouping never invents sections hidden by staff permissions or activity plan",()=>{
 const waiter=[{key:"assigned"},{key:"orders"},{key:"tables"},{key:"security"}];
 const grouped=groupVisibleMerchantSections(waiter);
 assert.deepEqual(grouped.flatMap(g=>g.items),waiter);
 assert(!grouped.flatMap(g=>g.items).some(x=>x.key==="payments"||x.key==="team"||x.key==="customers"));
 assert.equal(grouped.length,2);
});
test("fallback for a future permitted section is deterministic and does not expand access",()=>{
 assert.equal(merchantNavGroupFor("newActivityTool"),"settings");
 assert.deepEqual(groupVisibleMerchantSections([]),[]);
 const restricted=groupVisibleMerchantSections([{key:"newActivityTool"}]);
 assert.deepEqual(restricted,[{key:"settings",items:[{key:"newActivityTool"}]}]);
});
