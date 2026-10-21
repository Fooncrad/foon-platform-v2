/** Use only orders already filtered by ordersRows for this authenticated staff user.
 * Global branch aggregates must never be exposed to waiters or drivers. */
export function scopedStaffOverview<T extends object>(orders:T[],assignedWaiterCalls=0){
 const status=(order:T)=>"status" in order?String(order.status):"";
 const tableId=(order:T)=>"table_id" in order&&typeof tableId(order)==="string"?order.table_id:null;
 const waiterCalls=Number.isSafeInteger(assignedWaiterCalls)&&assignedWaiterCalls>0?assignedWaiterCalls:0;
 const pending=orders.filter(order=>["new","preparing","ready"].includes(String(order.status)));
 return {
  attention:(waiterCalls?{tables:waiterCalls}:{}) as Record<string,number>,
  summary:{
   waiterCalls,reservations:0,outstandingOrders:pending.length,
   sales:null,orders:orders.length,average:null,
   newOrders:orders.filter(order=>status(order)==="new").length,
   preparing:orders.filter(order=>order.status==="preparing").length,
   ready:orders.filter(order=>order.status==="ready").length,
   tables:new Set(pending.map(order=>order.table_id).filter(Boolean)).size
  },
  series:[] as {day:string;total:number}[],
  orders
 };
}
