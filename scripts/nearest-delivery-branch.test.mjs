import {test} from "node:test";
import assert from "node:assert/strict";
import {nearestDeliveryBranch} from "../lib/tenant/nearest-delivery-branch.mjs";
const branches=[{id:"a",name:"North",latitude:24.9,longitude:46.7},{id:"b",name:"South",latitude:24.6,longitude:46.7}];
test("select nearest branch based on customer saved coordinates",()=>assert.equal(nearestDeliveryBranch(branches,{latitude:24.65,longitude:46.7},["a","b"]).branch.id,"b"));
test("never choose branches that cannot fulfill the cart",()=>assert.equal(nearestDeliveryBranch(branches,{latitude:24.65,longitude:46.7},["a"]).branch.id,"a"));
test("without coordinates use neutral fallback, never pretend distance",()=>assert.deepEqual(nearestDeliveryBranch(branches,null,["a","b"]).distanceKm,null));
test("do not infer location from malformed values",()=>assert.equal(nearestDeliveryBranch(branches,{latitude:300,longitude:46},["a","b"]).approximate,true));
