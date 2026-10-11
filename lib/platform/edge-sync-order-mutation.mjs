// Central order mutation safety gate. The LAN prototype carries only item IDs
// and quantities, not trusted prices, creator identity or payment information.
// Do not acknowledge these as completed cloud orders until the server can
// validate catalog pricing and a registered POS operator.
export async function applyEdgeOrderMutation(_connection,event){
 if(!event||!["created","status"].includes(event.kind))throw Error("INVALID_EDGE_MUTATION");
 if(event.kind==="created"){
  // A future implementation must resolve menu items, compute totals server-side,
  // and atomically insert restaurant_orders and restaurant_order_items.
  throw Error("EDGE_ORDER_PRICING_NOT_IMPLEMENTED");
 }
 // A future implementation must lock the existing order and validate its
 // tenant, branch, version and allowed state transition before updating it.
 throw Error("EDGE_ORDER_STATUS_NOT_IMPLEMENTED");
}
