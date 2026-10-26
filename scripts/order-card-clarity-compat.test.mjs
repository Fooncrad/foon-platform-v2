import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workspace=readFileSync(new URL("../app/restaurant/order-workspace.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/restaurant/order-card-clarity.css",import.meta.url),"utf8");
test("order card clarity retains FOON High-Volume Mode and KDS filtering",()=>{
 for(const guard of ["activeKitchenOrders(orders)","resolveOrdersDisplay(ordersView,orders)","orderPage(selected,visibleOrderCount)","restaurantOrderCardsDense","HIGH_VOLUME_PAGE_SIZE","canRoleTransitionOrder(role,order.channel,order.status,next[order.status])"])
  assert.ok(workspace.includes(guard),guard);
});
test("clarity improvements are isolated from dense cards and payment logic",()=>{
 assert.ok(workspace.includes('import "./order-card-clarity.css"'));
 assert.ok(workspace.includes('className="restaurantOrderItemsPreview"'));
 assert.ok(workspace.includes('effectiveView!=="dense"&&order.items.length>0'));
 assert.ok(workspace.includes('order.status==="new"?(locale==="en"'));
 assert.match(css,/\.restaurantOrderCards:not\(\.restaurantOrderCardsDense\)>article/);
 assert.doesNotMatch(css,/(^|\n)\.restaurantOrderCards\s*\{/);
 assert.ok(workspace.includes('order.payment_status==="unpaid"'));
 assert.ok(workspace.includes('paymentStatus:"refunded"'));
});
