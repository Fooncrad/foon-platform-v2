import test from "node:test";
import assert from "node:assert/strict";
import {isPrivatePrinterAddress} from "../lib/platform/edge-print-jobs.mjs";
import {customerReceiptPrintDue,preparationPrintEvents,printerDispatchAllowed,routePreparationItems} from "../lib/restaurant/print-policy.mjs";
import {renderEscPos,runPrintAgentCycle} from "./foon-print-agent.mjs";

test("print relay accepts only private IPv4 printer endpoints",()=>{
 for(const address of ["10.4.0.12","172.16.1.20","172.31.255.254","192.168.1.8"])assert.equal(isPrivatePrinterAddress(address),true,address);
 for(const address of ["127.0.0.1","169.254.1.1","172.32.0.1","8.8.8.8","printer.local","192.168.1.999"])assert.equal(isPrivatePrinterAddress(address),false,address);
});

test("dispatch covers configurable departments and both preparation and receipt events",()=>{
 const sectionPrinter={autoPrint:"yes",purpose:"preparation",printOn:"on_accept"};
 assert.equal(printerDispatchAllowed({triggerEvent:"on_accept",departmentId:"made-up-future-section"},sectionPrinter),true);
 assert.equal(printerDispatchAllowed({triggerEvent:"on_prepare",departmentId:"barista"},{...sectionPrinter,printOn:"on_prepare"}),true);
 assert.equal(printerDispatchAllowed({triggerEvent:"on_paid"},{autoPrint:"yes",purpose:"customer_receipt",printOn:"on_paid"}),true);
 assert.equal(printerDispatchAllowed({triggerEvent:"on_paid"},{autoPrint:"yes",purpose:"both",printOn:"on_accept"}),true);
 assert.equal(printerDispatchAllowed({triggerEvent:"on_accept"},{autoPrint:"no",purpose:"preparation",printOn:"on_accept"}),false);
 assert.equal(printerDispatchAllowed({triggerEvent:"on_accept"},{autoPrint:"yes",purpose:"preparation",printOn:"manual"}),false);
});

test("kitchen tickets wait for staff acceptance and receipts wait for both completion and payment",()=>{
 assert.deepEqual(preparationPrintEvents("new","preparing"),["on_accept","on_prepare"]);
 assert.deepEqual(preparationPrintEvents("new","new"),[]);
 assert.equal(customerReceiptPrintDue("new","unpaid","new","paid"),false);
 assert.equal(customerReceiptPrintDue("ready","unpaid","completed","unpaid"),false);
 assert.equal(customerReceiptPrintDue("completed","unpaid","completed","paid"),true);
 assert.equal(customerReceiptPrintDue("ready","paid","completed","paid"),true);
 assert.equal(customerReceiptPrintDue("completed","paid","completed","paid"),false);
});

test("items print only at the printer assigned to their current department",()=>{
 const items=[{menu_item_id:"food-1",item_name:"Meal"},{menu_item_id:"drink-1",item_name:"Coffee"},{menu_item_id:"dessert-1",item_name:"Cake"}];
 const assignments=[{itemId:"food-1",departmentId:"kitchen-id"},{itemId:"drink-1",departmentId:"bar-id"},{itemId:"dessert-1",departmentId:"new-section-created-later"}];
 assert.deepEqual(routePreparationItems(items,assignments,"kitchen-id").map(item=>item.item_name),["Meal"],"food is printed in the kitchen");
 assert.deepEqual(routePreparationItems(items,assignments,"bar-id").map(item=>item.item_name),["Coffee"],"coffee is printed at the bar");
 assert.deepEqual(routePreparationItems(items,assignments,"new-section-created-later").map(item=>item.item_name),["Cake"]);
 assert.deepEqual(routePreparationItems(items,assignments,null),[]);
});

test("ESC/POS output includes accepted preparation and paid receipt content",()=>{
 const prep=renderEscPos({payload:{orderNumber:41,channel:"dine_in",triggerEvent:"on_accept",items:[{name:"Coffee",quantity:2,copies:2}],notes:{kitchen:"No sugar"}},printer:{address:"192.168.1.50",copies:1,purpose:"preparation"}}).toString("utf8");
 assert.equal((prep.match(/Coffee/g)||[]).length,2);assert.match(prep,/No sugar/);
 const receipt=renderEscPos({payload:{orderNumber:42,channel:"takeaway",triggerEvent:"on_paid",total:32,currency:"SAR",items:[{name:"Lunch",quantity:1,lineTotal:32,copies:3}]},printer:{address:"10.0.0.4",copies:2,purpose:"customer_receipt"}}).toString("utf8");
 assert.equal((receipt.match(/#42/g)||[]).length,2);assert.equal((receipt.match(/Lunch/g)||[]).length,2);assert.equal((receipt.match(/TOTAL: 32.00 SAR/g)||[]).length,2);
});

test("agent acknowledges department and receipt jobs only after sending each one",async()=>{
 const jobs=[
  {id:"prep",leaseToken:"prep-lease",payload:{triggerEvent:"on_accept",departmentId:"future-section"}},
  {id:"receipt",leaseToken:"receipt-lease",payload:{triggerEvent:"on_paid"}},
  null,
 ];const reports=[],printed=[];
 for(let i=0;i<3;i++)await runPrintAgentCycle({claim:async()=>({job:jobs.shift()}),print:async job=>{printed.push(job.payload.triggerEvent);},report:async(id,result)=>reports.push({id,...result})});
 assert.deepEqual(printed,["on_accept","on_paid"]);assert.deepEqual(reports.map(row=>[row.id,row.outcome]),[["prep","printed"],["receipt","printed"]]);
});

test("printer failures are reported to the durable queue without a false success",async()=>{
 const reports=[];const result=await runPrintAgentCycle({claim:async()=>({job:{id:"job",leaseToken:"lease",payload:{triggerEvent:"on_prepare"}}}),print:async()=>{throw Error("printer offline");},report:async(id,body)=>reports.push({id,...body})});
 assert.equal(result.printed,false);assert.equal(reports[0].outcome,"failed");assert.equal(reports[0].error,"printer offline");
});

test("a successful print retries only its cloud acknowledgement, never the physical print",async()=>{
 let prints=0;const reports=[];const result=await runPrintAgentCycle({claim:async()=>({job:{id:"job",leaseToken:"lease",leaseExpiresAt:new Date(Date.now()+60000).toISOString(),payload:{triggerEvent:"on_paid"}}}),print:async()=>{prints++;},report:async(id,body)=>{reports.push(body.outcome);if(reports.length===1)throw Error("temporary cloud outage");},wait:async()=>{}});
 assert.equal(result.printed,true);assert.equal(result.acknowledged,true);assert.equal(prints,1);assert.deepEqual(reports,["printed","printed"]);
});

test("a printed job is never reported as a printer failure when cloud acknowledgement is unavailable",async()=>{
 let prints=0;const reports=[];const result=await runPrintAgentCycle({claim:async()=>({job:{id:"job",leaseToken:"lease",leaseExpiresAt:new Date(Date.now()+60000).toISOString(),payload:{triggerEvent:"on_paid"}}}),print:async()=>{prints++;},report:async(id,body)=>{reports.push(body.outcome);throw Error("PRINT_LEASE_EXPIRED");}});
 assert.equal(result.printed,true);assert.equal(result.acknowledged,false);assert.equal(prints,1);assert.deepEqual(reports,["printed"]);
});
