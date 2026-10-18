import test from "node:test";
import assert from "node:assert/strict";
import {printerHandlesOrderEvent,shouldQueueFinalReceipt} from "../lib/restaurant/print-policy.ts";

test("preparation printers follow the selected acceptance or preparation event",()=>{
 const accepted={autoPrint:"yes",purpose:"preparation",printOn:"on_accept"};
 assert.equal(printerHandlesOrderEvent(accepted,"on_accept"),true);
 assert.equal(printerHandlesOrderEvent(accepted,"on_prepare"),false);
 assert.equal(printerHandlesOrderEvent({...accepted,printOn:"manual"},"on_accept"),false);
});

test("combined printers queue a preparation ticket and a full paid receipt",()=>{
 const combined={autoPrint:"yes",purpose:"both",printOn:"on_accept"};
 assert.equal(printerHandlesOrderEvent(combined,"on_accept"),true);
 assert.equal(printerHandlesOrderEvent(combined,"on_prepare"),false);
 assert.equal(printerHandlesOrderEvent(combined,"on_paid"),true);
 assert.equal(printerHandlesOrderEvent({...combined,printOn:"manual"},"on_paid"),false);
});

test("customer receipt waits for completed status and confirmed payment",()=>{
 const previous={status:"ready",paymentStatus:"paid"};
 assert.equal(shouldQueueFinalReceipt({status:"completed",paymentStatus:"paid"},previous),true);
 assert.equal(shouldQueueFinalReceipt({status:"ready",paymentStatus:"paid"},{status:"ready",paymentStatus:"unpaid"}),false);
 assert.equal(shouldQueueFinalReceipt({status:"completed",paymentStatus:"unpaid"},{status:"ready",paymentStatus:"unpaid"}),false);
 assert.equal(shouldQueueFinalReceipt({status:"completed",paymentStatus:"paid"},{status:"completed",paymentStatus:"paid"}),false);
});
