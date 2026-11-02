import test from "node:test";
import assert from "node:assert/strict";
import {eventDigest,validateCloudReceipt} from "./foon-edge-sync-contract.mjs";

test("cloud receipt must match device, event sequence, order and exact payload",()=>{
 const event={seq:3,order_id:"order-1",kind:"created",payload:{items:[{id:"a",quantity:1}]}};
 const receipt={deviceId:"device-1",eventSeq:3,orderId:"order-1",receiptId:"receipt-123",digest:eventDigest(event)};
 assert.equal(validateCloudReceipt(event,receipt,"device-1"),true);
 assert.equal(validateCloudReceipt(event,{...receipt,deviceId:"other"},"device-1"),false);
 assert.equal(validateCloudReceipt(event,{...receipt,eventSeq:4},"device-1"),false);
 assert.equal(validateCloudReceipt(event,{...receipt,orderId:"other"},"device-1"),false);
 assert.equal(validateCloudReceipt({...event,payload:{items:[{id:"a",quantity:2}]}},receipt,"device-1"),false);
 assert.equal(validateCloudReceipt(event,{...receipt,digest:"0".repeat(64)},"device-1"),false);
 assert.throws(()=>eventDigest({seq:0}),/INVALID_EDGE_EVENT/);
});
