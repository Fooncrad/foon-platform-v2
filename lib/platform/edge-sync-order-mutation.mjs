// Cloud-side mutation inside the same transaction as the idempotency inbox.
// Never trust a browser-supplied price or actor identity.
const transitions={
 new:new Set(["preparing","cancelled"]),
 preparing:new Set(["ready","cancelled"]),
 ready:new Set(["completed","cancelled"]),
 completed:new Set(),
 cancelled:new Set()
};
export async function applyEdgeOrderMutation(connection,event){
 if(!event||!["created","status"].includes(event.kind))throw Error("INVALID_EDGE_MUTATION");
 if(event.kind==="created"){
  // Offline item IDs alone cannot determine catalog prices, totals, operator,
  // payment or tax. Reject until server-side pricing is implemented.
  throw Error("EDGE_ORDER_PRICING_NOT_IMPLEMENTED");
 }
 const status=event.payload?.status;
 if(!Object.hasOwn(transitions,status))throw Error("INVALID_EDGE_STATUS");
 const [rows]=await connection.execute(
  "SELECT status FROM restaurant_orders WHERE id=? AND tenant_id=? AND branch_id=? FOR UPDATE",
  [event.orderId,event.tenantId,event.branchId]
 );
 const existing=rows[0];
 if(!existing)throw Error("EDGE_ORDER_NOT_FOUND");
 if(event.payload.expectedStatus!==undefined&&existing.status!==event.payload.expectedStatus)throw Error("EDGE_CONCURRENT_ORDER_UPDATE");
 if(existing.status===status)return;
 if(!transitions[existing.status]?.has(status))throw Error("EDGE_INVALID_STATUS_TRANSITION");
 const [result]=await connection.execute(
  "UPDATE restaurant_orders SET status=?,version=version+1 WHERE id=? AND tenant_id=? AND branch_id=? AND status=?",
  [status,event.orderId,event.tenantId,event.branchId,existing.status]
 );
 if(result.affectedRows!==1)throw Error("EDGE_CONCURRENT_ORDER_UPDATE");
}
