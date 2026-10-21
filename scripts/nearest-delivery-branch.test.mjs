import test from "node:test";
import assert from "node:assert/strict";
import {nearestDeliveryBranch,nearestOperatingBranch} from "../lib/tenant/nearest-delivery-branch.ts";
const a={id:"north",name:"North",latitude:24.8,longitude:46.7,acceptsDelivery:true};
const b={id:"south",name:"South",latitude:24.6,longitude:46.7,acceptsDelivery:true};
test("selects closest configured delivery branch from eligible branches",()=>{
 assert.equal(nearestDeliveryBranch([a,b],24.61,46.7),"south");
 assert.equal(nearestDeliveryBranch([a,b],24.61,46.7,["north"]),"north");
 assert.equal(nearestDeliveryBranch([{...b,acceptsDelivery:false},a],24.61,46.7),"north");
});
test("unknown coordinates, disabled delivery, or missing customer's location never selects a fabricated nearest branch",()=>{
 assert.equal(nearestDeliveryBranch([a,b],null,null),null);
 assert.equal(nearestDeliveryBranch([{...a,latitude:null,longitude:null}],24.61,46.7),null);
 assert.equal(nearestDeliveryBranch([{...a,acceptsDelivery:false}],24.61,46.7),null);
 assert.equal(nearestDeliveryBranch([a],24.61,46.7,["other"]),null);
});
